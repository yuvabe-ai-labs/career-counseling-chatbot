import type { IntakeQuestion } from "@yuvanext/contracts";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A small allowlist of Indian-education acronyms that should stay upper-case when an option
 * value like "science_pcm" or "cbse" is turned into a label — purely a display convention, not
 * question/option content: the actual option values themselves always come from the backend
 * (question.options), never hardcoded here. Everything else falls back to Title Case.
 */
const KNOWN_ACRONYMS = new Set(["cbse", "icse", "pcm", "pcb", "iti", "it"]);

function formatOptionLabel(value: string): string {
  return value
    .split("_")
    .map((word) => (KNOWN_ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : capitalize(word)))
    .join(" ");
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}

/**
 * `IntakeQuestion.options` is `z.unknown().nullable()` in the contract (packages/contracts/src/
 * intake.ts) — the seed data (packages/assessment/scripts/seed-intake.ts) stores it as a plain
 * JSON array of option-value strings, but the schema doesn't guarantee that shape, so this
 * parses defensively rather than assuming it.
 */
function parseOptionValues(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options.filter((option): option is string => typeof option === "string");
}

// bg-background: this page's fields sit directly on the semi-transparent light-purple hero
// panel, unlike e.g. ProfileFieldsForm's fields, which sit inside their own opaque white card —
// the shared Input/Combobox's default bg-transparent would otherwise show that purple through,
// not the crisp white box the design calls for.
const fieldInputClass = "h-12 w-full rounded-[8px] border-input bg-background px-4 text-sm shadow-none";

export interface IntakeQuestionFieldProps {
  question: IntakeQuestion;
  displayIndex: number;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  error?: string | null | undefined;
}

/**
 * One field in the Intake Questions screen (Figma "career" file node 346:100's "field-name"
 * groups) — label numbered per the design ("1.Which board...") plus a control shaped by the
 * question's own `responseType`, so the same component renders every segment's question set
 * without any per-question special-casing.
 */
export function IntakeQuestionField({
  question,
  displayIndex,
  value,
  onChange,
  error,
}: IntakeQuestionFieldProps) {
  const fieldId = `intake-question-${question.id}`;
  const optionValues = parseOptionValues(question.options);

  return (
    <div className="flex w-full flex-col items-start gap-4">
      <label
        htmlFor={fieldId}
        className="font-display text-xl font-medium text-foreground not-italic"
      >
        {displayIndex}.{question.promptText}
      </label>

      {question.responseType === "single_choice" ? (
        <Combobox
          id={fieldId}
          label={typeof value === "string" && value ? formatOptionLabel(value) : ""}
          onSelect={(option) => onChange(option.value)}
          // Options are the fixed, backend-approved set for this question (same list a native
          // <select> would have shown) — filtered locally rather than over the network, unlike
          // the State/City comboboxes this is styled after, since there are only a handful of
          // options per question and they're already in hand. The committed answer is always one
          // of these option values, never arbitrary typed text — single_choice is reserved for
          // questions with a small standardized real-world answer set, a sensitive topic, or an
          // in-app routing need (see seed-intake.ts's own comment); marks_band specifically is
          // also matched exactly by the recommendation engine (feasibility_rules.marks_band), so
          // free text there would silently break real matching, not just data quality.
          search={(query) => {
            const normalizedQuery = query.trim().toLowerCase();
            const matches = optionValues.filter((option) =>
              formatOptionLabel(option).toLowerCase().includes(normalizedQuery),
            );
            return Promise.resolve(
              matches.map((option) => ({ value: option, label: formatOptionLabel(option) })),
            );
          }}
          placeholder="Type to search…"
          aria-invalid={Boolean(error)}
          className="w-full"
          inputClassName="bg-background"
        />
      ) : null}

      {question.responseType === "multi_choice" ? (
        <div className="flex w-full flex-col gap-2 rounded-[8px] border border-input bg-background p-4">
          {optionValues.map((option) => {
            const selected = Array.isArray(value) ? value : [];
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((item) => item !== option)
                      : [...selected, option];
                    onChange(next);
                  }}
                  className="size-3.5 shrink-0 accent-[var(--color-brand)]"
                />
                {formatOptionLabel(option)}
              </label>
            );
          })}
        </div>
      ) : null}

      {question.responseType === "short_text" ? (
        <Input
          id={fieldId}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          // Server-driven example hint (seed-intake.ts's placeholder_text) — falls back to a
          // generic prompt for any short_text question that doesn't have one configured.
          placeholder={question.placeholderText ?? "Type your answer"}
          aria-invalid={Boolean(error)}
          className={fieldInputClass}
        />
      ) : null}

      {error ? (
        <p className={cn("font-display text-xs font-normal text-destructive")}>{error}</p>
      ) : null}
    </div>
  );
}
