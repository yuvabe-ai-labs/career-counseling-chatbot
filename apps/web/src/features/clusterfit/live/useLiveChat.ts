import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { ClusterfitCaptureResponseSchema, ClusterfitTranscript } from "@yuvapath/contracts";
import {
  captureClusterfitSituation,
  checkClusterfitCoverage,
  getClusterfitLiveToken,
  getClusterfitWellbeingMessage,
} from "../api/clusterfit";
import { LiveAudio } from "./audio";

export type LiveChatStatus =
  "idle" | "connecting" | "live" | "reconnecting" | "wrapping_up" | "extracting" | "done" | "error";
export type CaptureResult = z.infer<typeof ClusterfitCaptureResponseSchema>;
type Turn = ClusterfitTranscript[number];

type LiveMessage = {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
  };
  toolCall?: { functionCalls?: { id?: string; name: string }[] };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
};

const COVERED = "Everything is covered. Continue speaking now with the closing summary.";

/**
 * Part A + E chat (plan §14.3, §15.3): the browser talks to Gemini Live directly with a single-use
 * token from our API, and behaves like the POC frontend (same tools, same transcript merging). Our
 * API is called only for the token, check_coverage, the wellbeing copy and the final capture.
 */
export function useLiveChat(options: {
  sessionId: string;
  onCaptured: (result: CaptureResult) => void;
}) {
  const { sessionId } = options;
  const [status, setStatus] = useState<LiveChatStatus>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [wellbeingMessage, setWellbeingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const audio = useRef<LiveAudio | null>(null);
  const transcript = useRef<Turn[]>([]);
  const resumeHandle = useRef<string | null>(null);
  const connectionsLeft = useRef(0);
  const toolResults = useRef<Record<string, string>>({});
  const ending = useRef(false);
  const wellbeingFlagged = useRef(false);
  const captureKey = useRef<string | null>(null);
  const voiceWanted = useRef(true);
  const onCaptured = useRef(options.onCaptured);
  const connectRef = useRef<(isResume: boolean) => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    onCaptured.current = options.onCaptured;
  }, [options.onCaptured]);

  // POC add_to_transcript: consecutive chunks from the same speaker join into one turn.
  const addToTranscript = useCallback((speaker: Turn["speaker"], text: string) => {
    const list = transcript.current;
    const last = list[list.length - 1];
    if (last && last.speaker === speaker) last.text += text;
    else list.push({ speaker, text });
    setTurns(list.map((turn) => ({ ...turn })));
  }, []);

  const send = useCallback((payload: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(payload));
  }, []);

  const sendAudio = useCallback(
    (data: string) =>
      send({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }),
    [send],
  );

  const sendToolResponse = useCallback(
    (id: string | undefined, name: string, result: string) =>
      send({
        toolResponse: {
          functionResponses: [{ ...(id ? { id } : {}), name, response: { result } }],
        },
      }),
    [send],
  );

  const finish = useCallback(async () => {
    ending.current = true;
    setStatus("wrapping_up");
    audio.current?.stopMic();
    setMicOn(false);
    // Let the guide finish its goodbye before closing (up to 8 s).
    for (let waited = 0; waited < 8000 && audio.current?.speaking; waited += 250) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    ws.current?.close(1000);
    setStatus("extracting");
    captureKey.current ??= crypto.randomUUID();
    try {
      const result = await captureClusterfitSituation(sessionId, {
        transcript: transcript.current,
        idempotencyKey: captureKey.current,
        wellbeingFlagged: wellbeingFlagged.current,
      });
      setStatus("done");
      onCaptured.current(result);
    } catch {
      setStatus("error");
      setError("We couldn't save the chat just now, but you can carry on.");
    }
  }, [sessionId]);

  const handleToolCall = useCallback(
    async (call: { id?: string; name: string }) => {
      if (call.name === "check_coverage") {
        const { instruction } = await checkClusterfitCoverage(sessionId, transcript.current).catch(
          () => ({
            instruction: COVERED,
          }),
        );
        sendToolResponse(call.id, call.name, instruction);
      } else if (call.name === "flag_wellbeing_concern") {
        wellbeingFlagged.current = true;
        sendToolResponse(call.id, call.name, toolResults.current[call.name] ?? "Flag received.");
        const copy = await getClusterfitWellbeingMessage(sessionId, crypto.randomUUID()).catch(
          () => null,
        );
        setWellbeingMessage(copy?.message ?? null);
      } else if (call.name === "end_discovery") {
        sendToolResponse(
          call.id,
          call.name,
          toolResults.current[call.name] ?? "Conversation marked complete.",
        );
        void finish();
      }
    },
    [finish, sessionId, sendToolResponse],
  );

  const connect = useCallback(
    async (isResume: boolean) => {
      const token = await getClusterfitLiveToken(sessionId);
      connectionsLeft.current = token.connectionsLeft;
      toolResults.current = token.toolResults;
      const socket = new WebSocket(token.websocketUrl);
      socket.binaryType = "arraybuffer";
      ws.current = socket;

      socket.onopen = () => {
        // Prompt, tools and voice are locked in the token; the browser sends only model + resumption.
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${token.model}`,
              sessionResumption: resumeHandle.current ? { handle: resumeHandle.current } : {},
            },
          }),
        );
      };

      socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
        const raw =
          typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
        let message: LiveMessage;
        try {
          message = JSON.parse(raw) as LiveMessage;
        } catch {
          return;
        }
        if (message.setupComplete !== undefined) {
          setStatus("live");
          if (!isResume) send({ realtimeInput: { text: token.kickoffText } });
          if (voiceWanted.current && audio.current && !audio.current.recording) {
            audio.current
              .startMic(sendAudio)
              .then(() => setMicOn(true))
              .catch(() => {
                voiceWanted.current = false;
                setError("Microphone not available, so let's type instead.");
              });
          }
        }
        const content = message.serverContent;
        for (const part of content?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) void audio.current?.play(part.inlineData.data);
        }
        if (content?.inputTranscription?.text)
          addToTranscript("student", content.inputTranscription.text);
        if (content?.outputTranscription?.text)
          addToTranscript("guide", content.outputTranscription.text);
        if (content?.interrupted) audio.current?.stopPlayback();
        for (const call of message.toolCall?.functionCalls ?? []) void handleToolCall(call);
        const update = message.sessionResumptionUpdate;
        if (update?.resumable && update.newHandle) resumeHandle.current = update.newHandle;
      };

      socket.onclose = (event: CloseEvent) => {
        if (ending.current || ws.current !== socket) return;
        // Gemini's close code and reason are the only clue to why a chat dropped.
        console.warn("[clusterfit] live connection closed", event.code, event.reason);
        const lost = () => {
          // Keep what the student already shared: read the chat so far rather than dropping it.
          if (transcript.current.some((turn) => turn.speaker === "student")) {
            setError("The chat connection dropped, so we saved what you shared so far.");
            void finish();
            return;
          }
          setStatus("error");
          setError("The chat connection was lost. You can carry on to the next part.");
        };
        // Dropped mid-chat: resume with a fresh token and the latest handle (up to 3 tokens).
        if (resumeHandle.current && connectionsLeft.current > 0) {
          setStatus("reconnecting");
          audio.current?.stopMic();
          setMicOn(false);
          void connectRef.current(true).catch(lost);
        } else {
          lost();
        }
      };
    },
    [addToTranscript, finish, handleToolCall, sessionId, send, sendAudio],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const start = useCallback(
    async (withVoice: boolean) => {
      voiceWanted.current = withVoice;
      ending.current = false;
      setError(null);
      setStatus("connecting");
      audio.current ??= new LiveAudio();
      try {
        await connect(false);
      } catch {
        setStatus("error");
        setError("The chat isn't available right now. You can carry on to the next part.");
      }
    },
    [connect],
  );

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Typed messages are not transcribed by the Live API, so record them here (POC rule).
      addToTranscript("student", trimmed);
      send({ realtimeInput: { text: trimmed } });
    },
    [addToTranscript, send],
  );

  const toggleMic = useCallback(async () => {
    if (!audio.current) return;
    if (audio.current.recording) {
      audio.current.stopMic();
      setMicOn(false);
      return;
    }
    try {
      await audio.current.startMic(sendAudio);
      setMicOn(true);
    } catch {
      setError("Microphone not available, so let's type instead.");
    }
  }, [sendAudio]);

  /** The student ends early: capture what was said so far, or just stop if nothing yet. */
  const endNow = useCallback(() => {
    if (transcript.current.some((turn) => turn.speaker === "student")) {
      void finish();
      return;
    }
    ending.current = true;
    ws.current?.close(1000);
    void audio.current?.close();
    setStatus("idle");
  }, [finish]);

  useEffect(
    () => () => {
      ending.current = true;
      ws.current?.close(1000);
      void audio.current?.close();
    },
    [],
  );

  /**
   * "Skip this": leave the chat now. Anything the student already said is still saved in the
   * background (the request outlives this screen), so a partly finished chat isn't lost.
   */
  const skip = useCallback(() => {
    ending.current = true;
    ws.current?.close(1000);
    void audio.current?.close();
    if (transcript.current.some((turn) => turn.speaker === "student")) {
      captureKey.current ??= crypto.randomUUID();
      void captureClusterfitSituation(sessionId, {
        transcript: transcript.current,
        idempotencyKey: captureKey.current,
        wellbeingFlagged: wellbeingFlagged.current,
      }).catch(() => undefined);
    }
  }, [sessionId]);

  return {
    status,
    turns,
    micOn,
    error,
    wellbeingMessage,
    start,
    sendText,
    toggleMic,
    endNow,
    skip,
  };
}
