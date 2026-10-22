import { LIVE_TOOL_DECLARATIONS } from "./poc-constants.js";

/**
 * The POC's gemini_live.py session config (voice "Puck", both transcriptions, activity-only turn
 * coverage, sliding-window compression, the 3 tools), in the exact REST shape the Python SDK sends
 * when minting a constrained token (captured 2026-10-18, plan §16.4).
 *
 * `sessionResumption` is deliberately NOT here: the token locks only the fields set below
 * (LIVE_FIELD_MASK), so the browser can still send a resumption handle after a dropped
 * connection (plan §16.2 F10). Verified: a resumed session kept the chat and still ignored a
 * client-sent prompt.
 */
export const liveConnectSetup = (model: string, systemInstruction: string) => ({
  model: model.startsWith("models/") ? model : `models/${model}`,
  generationConfig: {
    responseModalities: ["AUDIO"],
    speechConfig: { voice_config: { prebuilt_voice_config: { voice_name: "Puck" } } },
  },
  systemInstruction: { parts: [{ text: systemInstruction }] },
  tools: [
    {
      functionDeclarations: LIVE_TOOL_DECLARATIONS.map((tool) => ({
        description: tool.description,
        name: tool.name,
      })),
    },
  ],
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  realtimeInputConfig: { turn_coverage: "TURN_INCLUDES_ONLY_ACTIVITY" },
  contextWindowCompression: { sliding_window: {} },
});

/** Locks every field set in liveConnectSetup (the SDK's lock_additional_fields=[] mask). */
export const LIVE_FIELD_MASK =
  "model,generationConfig.responseModalities,generationConfig.speechConfig,systemInstruction.parts,tools," +
  "inputAudioTranscription,outputAudioTranscription,realtimeInputConfig,contextWindowCompression";

/** Browser WebSocket URL for a constrained token (Google's browser ephemeral-token example). */
export const liveWebSocketUrl = (token: string): string =>
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService." +
  `BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
