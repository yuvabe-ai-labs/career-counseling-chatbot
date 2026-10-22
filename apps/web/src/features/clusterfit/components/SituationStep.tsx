import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Keyboard,
  Languages,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { ClusterfitValuesRanking } from "@yuvapath/contracts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { completeClusterfitSituation, saveClusterfitSituation } from "../api/clusterfit";
import {
  PART_COPY,
  SITUATION_FIELD_LABELS,
  SITUATION_VALUE_LABELS,
  VALUE_CARD_TEXT,
} from "../lib/copy";
import { useLiveChat, type CaptureResult, type LiveChatStatus } from "../live/useLiveChat";

type Grade = 9 | 10 | 11 | 12;
type ValueKey = ClusterfitValuesRanking[number]["value"];

const GRADES: readonly Grade[] = [9, 10, 11, 12];
const POINT_ICONS = [Clock, Languages, Check] as const;

const pretty = (value: string) => SITUATION_VALUE_LABELS[value] ?? value.replace(/_/g, " ");

/** Readable summary of one chat field for the confirm card. */
function describe(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return pretty(value);
  if (Array.isArray(value)) {
    const parts = (value as unknown[]).map((entry) =>
      typeof entry === "string"
        ? pretty(entry)
        : typeof entry === "object" && entry !== null && "name" in entry
          ? String(entry.name)
          : "",
    );
    return parts.filter(Boolean).join(", ") || null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("open_to" in record) return describe(record.open_to);
    if ("study" in record || "work" in record) {
      const study = record.study as { preference?: string } | null;
      const work = record.work as { preference?: string } | null;
      return (
        [
          study?.preference && `study: ${pretty(study.preference)}`,
          work?.preference && `work: ${pretty(work.preference)}`,
        ]
          .filter(Boolean)
          .join("; ") || null
      );
    }
  }
  return null;
}

/**
 * After the chat. The class comes from the chat; it is asked here only when the chat couldn't
 * catch it (it decides the puzzles). Values (Part E) come pre-filled from the chat; the student
 * picks exactly three, as the questionnaire asks.
 */
export function ConfirmCard({
  sessionId,
  capture,
  initialGrade,
  initialValues,
  onConfirmed,
}: {
  sessionId: string;
  capture: CaptureResult | null;
  initialGrade: Grade | null;
  initialValues: readonly ValueKey[];
  onConfirmed: () => void;
}) {
  const canonical = capture?.situation?.canonical;
  const knownGrade = canonical?.grade ?? initialGrade;
  const [grade, setGrade] = useState<Grade | null>(knownGrade);
  // The chat asks the class; only when it couldn't catch it is the class asked here.
  const [askGrade] = useState(knownGrade === null);
  const [values, setValues] = useState<ValueKey[]>(
    canonical?.values?.length
      ? [...canonical.values].sort((a, b) => a.rank - b.rank).map((entry) => entry.value)
      : [...initialValues],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = canonical?.context ?? {};
  const known = Object.entries(SITUATION_FIELD_LABELS).flatMap(([key, label]) => {
    const entry = context[key] as { status?: string; value?: unknown } | undefined;
    const text = entry?.status === "known" ? describe(entry.value) : null;
    return text ? [{ key, label, text }] : [];
  });

  const toggleValue = (value: ValueKey) =>
    setValues((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : current.length < 3
          ? [...current, value]
          : current,
    );

  const ready = grade !== null && values.length === 3;

  const confirm = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await saveClusterfitSituation(sessionId, {
        grade,
        values: values.map((value, index) => ({ value, rank: index + 1 })),
      });
      onConfirmed();
    } catch (caught) {
      setError(getErrorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <section className="flex w-full animate-in flex-col gap-7 rounded-[1.6rem] border border-brand/15 bg-background p-5 shadow-sm duration-300 fade-in sm:p-8">
      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Sparkles className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {capture ? "Here's what I understood" : "Just a couple of things"}
          </h2>
          <p className="text-muted-foreground">
            {capture
              ? "Check this looks right, then we'll move on to some quick activities."
              : "This helps us choose the right questions for you."}
          </p>
        </div>
      </header>

      {known.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {known.map((entry) => (
            <div key={entry.key} className="rounded-xl bg-brand/5 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{entry.label}</dt>
              <dd className="font-medium text-foreground first-letter:uppercase">{entry.text}</dd>
            </div>
          ))}
        </dl>
      )}

      {askGrade && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-medium text-foreground">
            Which class are you in?{" "}
            <span className="text-sm font-normal text-muted-foreground">
              (we use this to pick your puzzles)
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GRADES.map((option) => (
              <Button
                key={option}
                type="button"
                variant={grade === option ? "default" : "outline"}
                aria-pressed={grade === option}
                onClick={() => setGrade(option)}
              >
                Class {option}
              </Button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium text-foreground">What matters most to you?</legend>
        <p className="-mt-1 text-sm text-muted-foreground">
          {values.length === 0
            ? "Tap three cards, most important first."
            : values.length < 3
              ? `${values.length} of 3 chosen. Tap a card again to remove it.`
              : "All three chosen. Tap a card again to remove it."}
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(VALUE_CARD_TEXT) as ValueKey[]).map((value) => {
            const rank = values.indexOf(value) + 1;
            const full = rank === 0 && values.length >= 3;
            return (
              <li key={value}>
                <button
                  type="button"
                  aria-pressed={rank > 0}
                  disabled={full}
                  onClick={() => toggleValue(value)}
                  className={cn(
                    "flex h-full min-h-14 w-full items-center gap-3 rounded-[1rem] border p-3 text-left text-sm transition-colors",
                    rank > 0
                      ? "border-brand bg-brand/10 font-medium text-foreground"
                      : "border-border bg-background hover:bg-accent",
                    full && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                      rank > 0 ? "border-brand bg-brand text-white" : "border-border",
                    )}
                  >
                    {rank > 0 ? rank : ""}
                  </span>
                  {VALUE_CARD_TEXT[value]}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!ready || saving}
          onClick={() => void confirm()}
        >
          {saving ? <Spinner /> : null}
          {!grade
            ? "Choose your class to continue"
            : values.length < 3
              ? `Choose ${3 - values.length} more to continue`
              : "Looks right, continue"}
        </Button>
      </div>
    </section>
  );
}

const STATUS_TEXT: Partial<Record<LiveChatStatus, string>> = {
  connecting: "Connecting…",
  live: "Online",
  reconnecting: "Reconnecting…",
  wrapping_up: "Wrapping up…",
  extracting: "Noting down what you shared…",
};

/** Three bouncing dots while the guide is preparing a reply. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Guide is typing">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-2 animate-bounce rounded-full bg-brand/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Part A + E: the Gemini Live chat (voice or typing), then the confirm card. */
/**
 * Part A + E: the Gemini Live chat (voice or typing). When it ends — finished, failed or skipped
 * — "About you" is completed and the activities open. The confirm card (ConfirmCard above) is
 * switched off for now (plan §18.1 R11); what the chat learned is saved as it is.
 */
export function SituationStep({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const chat = useLiveChat({ sessionId, onCaptured: setCapture });
  const scroller = useRef<HTMLOListElement>(null);
  const pinnedToBottom = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const movedOn = useRef(false);

  const lastTurn = chat.turns[chat.turns.length - 1];
  const guideThinking = chat.status === "live" && lastTurn?.speaker === "student";

  const finishAboutYou = useCallback(async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await completeClusterfitSituation(sessionId);
      onDone();
    } catch (caught) {
      setFinishError(getErrorMessage(caught));
      setFinishing(false);
    }
  }, [onDone, sessionId]);

  // Follow the newest message, unless the student scrolled up to read an earlier one.
  useLayoutEffect(() => {
    const list = scroller.current;
    if (list && pinnedToBottom.current)
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [chat.turns, chat.status, guideThinking]);

  useEffect(() => {
    if (chat.status === "live") input.current?.focus();
  }, [chat.status]);

  // The chat saved what the student shared: move straight on to the activities (once).
  useEffect(() => {
    if (!capture || movedOn.current) return;
    movedOn.current = true;
    void finishAboutYou();
  }, [capture, finishAboutYou]);

  const skip = () => {
    movedOn.current = true;
    chat.skip();
    void finishAboutYou();
  };

  if (capture || finishing || chat.status === "error" || finishError) {
    const waiting = (capture || finishing) && !finishError;
    return (
      <section className="flex w-full animate-in flex-col items-center gap-5 rounded-[1.6rem] border border-brand/15 bg-background p-8 text-center shadow-sm duration-300 fade-in sm:p-12">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
          {waiting ? <Spinner /> : <Sparkles className="size-7" />}
        </span>
        <div className="flex max-w-md flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {waiting ? "Moving on to the activities…" : "Let's carry on"}
          </h2>
          <p className="text-muted-foreground">
            {finishError ?? chat.error ?? "Thanks for chatting. Next, a few quick activities."}
          </p>
        </div>
        {!waiting && (
          <Button type="button" size="lg" onClick={() => void finishAboutYou()}>
            Continue to activities <ArrowRight />
          </Button>
        )}
      </section>
    );
  }

  if (chat.status === "idle") {
    return (
      <section className="flex w-full animate-in flex-col items-center gap-8 rounded-[1.6rem] border border-brand/15 bg-background p-8 text-center shadow-sm duration-300 fade-in sm:p-12">
        <div className="flex flex-col items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
            <MessageCircle className="size-8" />
          </span>
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            {PART_COPY.A.title}
          </h2>
          <p className="max-w-xl text-muted-foreground">{PART_COPY.A.instruction}</p>
        </div>
        <ul className="grid w-full gap-4 sm:grid-cols-3">
          {PART_COPY.A.points.map((point, index) => {
            const Icon = POINT_ICONS[index] ?? Check;
            return (
              <li
                key={point}
                className="flex flex-col items-center gap-3 rounded-2xl bg-brand/5 p-5 text-sm text-foreground"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-background text-brand shadow-sm">
                  <Icon className="size-4" />
                </span>
                {point}
              </li>
            );
          })}
        </ul>
        <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
          <Button type="button" size="lg" onClick={() => void chat.start(true)}>
            <Mic /> Talk with voice
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={() => void chat.start(false)}>
            <Keyboard /> Type instead
          </Button>
        </div>
      </section>
    );
  }

  const busy =
    chat.status === "connecting" || chat.status === "wrapping_up" || chat.status === "extracting";
  const canType = chat.status === "live";

  return (
    <section className="flex w-full animate-in flex-col overflow-hidden rounded-[1.6rem] border border-brand/15 bg-background shadow-sm duration-300 fade-in">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand text-white">
            <Sparkles className="size-5" />
          </span>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">YuvaPath guide</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "size-2 rounded-full",
                  chat.status === "live" ? "bg-emerald-500" : "bg-amber-400",
                )}
              />
              {chat.micOn ? "Listening…" : (STATUS_TEXT[chat.status] ?? "")}
            </span>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={skip}>
          Skip this <SkipForward />
        </Button>
      </header>

      {/* Approved copy from the safety module only; nothing is invented here (AGENTS.md). */}
      {chat.wellbeingMessage && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-red-900">
          {chat.wellbeingMessage}
        </div>
      )}

      <ol
        ref={scroller}
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget;
          pinnedToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        }}
        className="flex h-[min(58vh,520px)] min-h-72 flex-col gap-3 overflow-y-auto bg-brand/[0.03] px-3 py-4 sm:px-5"
      >
        {chat.turns.map((turn, index) =>
          turn.speaker === "guide" ? (
            <li key={index} className="flex max-w-[88%] items-end gap-2 self-start">
              <span className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Sparkles className="size-3.5" />
              </span>
              <p className="rounded-2xl rounded-bl-md bg-background px-4 py-2.5 leading-relaxed text-foreground shadow-sm ring-1 ring-border">
                {turn.text}
              </p>
            </li>
          ) : (
            <li
              key={index}
              className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 leading-relaxed text-primary-foreground"
            >
              {turn.text}
            </li>
          ),
        )}
        {guideThinking && (
          <li className="flex items-end gap-2 self-start">
            <span className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Sparkles className="size-3.5" />
            </span>
            <span className="rounded-2xl rounded-bl-md bg-background px-4 py-2 shadow-sm ring-1 ring-border">
              <TypingDots />
            </span>
          </li>
        )}
        {(busy || chat.status === "reconnecting") && (
          <li className="flex items-center gap-2 self-center rounded-full bg-background px-4 py-2 text-sm text-muted-foreground shadow-sm ring-1 ring-border">
            <Spinner />
            {STATUS_TEXT[chat.status]}
          </li>
        )}
      </ol>

      {chat.error && (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {chat.error}
        </p>
      )}

      <form
        className="flex items-center gap-2 border-t border-border bg-background p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          pinnedToBottom.current = true;
          chat.sendText(draft);
          setDraft("");
        }}
      >
        <Button
          type="button"
          size="icon"
          variant={chat.micOn ? "default" : "outline"}
          aria-label={chat.micOn ? "Mute microphone" : "Talk with voice"}
          aria-pressed={chat.micOn}
          onClick={() => void chat.toggleMic()}
          disabled={!canType}
          className={cn(chat.micOn && "animate-pulse")}
        >
          {chat.micOn ? <Mic /> : <MicOff />}
        </Button>
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={canType ? "Type your answer…" : "Please wait…"}
          aria-label="Type your answer"
          disabled={!canType}
          enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-full border border-input bg-background px-5 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={!canType || !draft.trim()}>
          <Send />
        </Button>
      </form>
    </section>
  );
}
