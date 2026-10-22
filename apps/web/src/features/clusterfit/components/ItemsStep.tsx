import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Info,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ClusterfitPart } from "@yuvapath/contracts";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { getClusterfitPartItems } from "../api/clusterfit";
import { saveAnswer } from "../lib/answers";
import { PART_COPY } from "../lib/copy";

type Answer = string | number;

const PART_NUMBER: Record<ClusterfitPart, number> = { B: 2, C: 3, D: 4 };

/** Icons next to the Part B words, so the three answers read at a glance. */
const INTEREST_ICONS: Record<string, LucideIcon> = {
  yes: ThumbsUp,
  maybe: CircleHelp,
  no: ThumbsDown,
};

const itemElementId = (itemKey: string) => `clusterfit-item-${itemKey}`;

/** Parts B, C and D: fixed item order, autosave on every tap, resume at the first open screen. */
export function ItemsStep({
  sessionId,
  part,
  onBack,
  onDone,
  doneLabel,
  submitting = false,
}: {
  sessionId: string;
  part: ClusterfitPart;
  onBack: () => void;
  onDone: () => void;
  doneLabel: string;
  submitting?: boolean;
}) {
  const copy = PART_COPY[part];
  const query = useQuery({
    queryKey: ["clusterfit", sessionId, "items", part],
    queryFn: () => getClusterfitPartItems(sessionId, part),
    staleTime: Infinity,
  });
  // Answers given on this screen, layered over the ones the server already has (resume).
  const [localAnswers, setLocalAnswers] = useState<Record<string, Answer>>({});
  const [chosenPage, setPage] = useState<number | null>(null);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  // Every item must be answered. A puzzle skipped before skips were removed is stored as null,
  // so it counts as unanswered here.
  const answers = useMemo(() => {
    const merged: Record<string, Answer> = {};
    for (const [key, value] of Object.entries(query.data?.answers ?? {}))
      if (value !== null) merged[key] = value;
    return { ...merged, ...localAnswers };
  }, [query.data, localAnswers]);
  const isAnswered = (itemKey: string) => answers[itemKey] !== undefined;
  const firstOpen = items.findIndex((item) => (query.data?.answers ?? {})[item.itemKey] == null);
  const page = chosenPage ?? (firstOpen === -1 ? 0 : Math.floor(firstOpen / copy.perScreen));

  useEffect(() => {
    shownAt.current = performance.now();
    window.scrollTo({ top: 0 });
  }, [page]);

  if (query.isError)
    return (
      <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  if (!query.data) return <LoadingState />;

  const pages = Math.max(1, Math.ceil(items.length / copy.perScreen));
  const visible = items.slice(page * copy.perScreen, (page + 1) * copy.perScreen);
  const answeredCount = items.filter((item) => isAnswered(item.itemKey)).length;
  const complete = answeredCount >= items.length;
  const lastPage = page >= pages - 1;
  const unanswered = items.filter((item) => !isAnswered(item.itemKey));
  const screenDone = visible.every((item) => isAnswered(item.itemKey));

  const choose = (itemKey: string, answer: Answer) => {
    const firstTime = !isAnswered(itemKey);
    setLocalAnswers((current) => ({ ...current, [itemKey]: answer }));
    setError(null);
    setSaving((count) => count + 1);
    void saveAnswer({ sessionId, itemKey, answer, shownAt: shownAt.current })
      .catch((caught: unknown) => setError(getErrorMessage(caught)))
      .finally(() => setSaving((count) => count - 1));
    // One puzzle per screen: move on after an answer.
    if (part === "C") {
      if (!lastPage) setPage(page + 1);
      return;
    }
    // Several per screen: bring the next unanswered statement into view.
    if (firstTime) {
      const next = visible.find((item) => item.itemKey !== itemKey && !isAnswered(item.itemKey));
      if (next)
        window.setTimeout(
          () =>
            document
              .getElementById(itemElementId(next.itemKey))
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          150,
        );
    }
  };

  return (
    <section className="flex w-full animate-in flex-col gap-6 duration-300 fade-in">
      <header className="flex flex-col gap-3">
        <span className="text-sm font-semibold tracking-wide text-brand uppercase">
          Part {PART_NUMBER[part]} of 4
        </span>
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            {copy.title}
          </h2>
          <span className="shrink-0 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{answeredCount}</span> of {items.length}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-brand/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={answeredCount}
        >
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${items.length ? (answeredCount / items.length) * 100 : 0}%` }}
          />
        </div>
        {page === 0 && (
          <p className="flex gap-3 rounded-xl bg-brand/5 px-4 py-3 text-sm text-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" />
            {copy.instruction}
          </p>
        )}
        {"prompt" in copy && (
          <p className="font-display text-lg font-medium text-foreground">{copy.prompt}</p>
        )}
      </header>

      <ol className="flex flex-col gap-4">
        {visible.map((item) => {
          const answered = isAnswered(item.itemKey);
          return (
            <li
              key={item.itemKey}
              id={itemElementId(item.itemKey)}
              className={cn(
                "scroll-mt-24 rounded-[1.2rem] border bg-background p-4 transition-colors sm:p-5",
                answered ? "border-brand/30" : "border-border",
              )}
            >
              <p className="mb-4 flex gap-3 font-display text-lg leading-snug text-foreground">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    answered ? "bg-brand text-white" : "bg-brand/10 text-brand",
                  )}
                >
                  {answered && part !== "C" ? <Check className="size-4" /> : item.position}
                </span>
                <span>{item.text}</span>
              </p>

              {part === "C" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {item.options.map((option) => {
                    const selected = answers[item.itemKey] === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => choose(item.itemKey, option.key)}
                        className={cn(
                          "flex min-h-14 items-center gap-3 rounded-[1rem] border p-3 text-left transition-colors active:scale-[0.99]",
                          selected
                            ? "border-brand bg-brand/10 font-medium"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                            selected ? "border-brand bg-brand text-white" : "border-border",
                          )}
                        >
                          {option.key}
                        </span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={cn(
                    "grid gap-2",
                    part === "B" ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
                  )}
                >
                  {item.options.map((option) => {
                    const value: Answer = part === "D" ? Number(option.key) : option.key;
                    const selected = answers[item.itemKey] === value;
                    const Icon = part === "B" ? INTEREST_ICONS[option.key] : undefined;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => choose(item.itemKey, value)}
                        className={cn(
                          "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1rem] border px-2 py-2.5 text-center text-sm leading-tight transition-colors active:scale-[0.98]",
                          selected
                            ? "border-brand bg-brand font-semibold text-white"
                            : "border-border bg-background text-foreground hover:bg-accent",
                        )}
                      >
                        {Icon && <Icon className="size-5" />}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {part === "C" && (
                <p className="mt-4 text-sm text-muted-foreground">
                  No marks are lost for a wrong answer, so make your best guess.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {lastPage && !complete && unanswered.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please answer every question before you continue. Still to answer:{" "}
          {unanswered
            .slice(0, 12)
            .map((item) => item.position)
            .join(", ")}
          {unanswered.length > 12 ? "…" : ""}. Use Back to find them.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <nav className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button
          type="button"
          variant="outline"
          onClick={() => (page === 0 ? onBack() : setPage(page - 1))}
        >
          <ArrowLeft /> Back
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          Screen {page + 1} of {pages}
        </span>
        {lastPage ? (
          <Button type="button" disabled={!complete || saving > 0 || submitting} onClick={onDone}>
            {submitting ? <Spinner /> : null}
            {complete ? doneLabel : `${items.length - answeredCount} left to answer`}
            <ArrowRight />
          </Button>
        ) : (
          <Button
            type="button"
            variant={screenDone ? "default" : "outline"}
            onClick={() => setPage(page + 1)}
          >
            Next <ArrowRight />
          </Button>
        )}
      </nav>
    </section>
  );
}
