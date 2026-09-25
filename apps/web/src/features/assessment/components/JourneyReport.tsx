import { useRef, useState, type RefObject } from "react";
import type { AssessmentResult, RiasecScale, UserProfile } from "@yuvapath/contracts";
import bank from "@/assets/report-card/bank.svg";
import bankCard from "@/assets/report-card/bank-card.svg";
import bookOpenText from "@/assets/report-card/book-open-text.svg";
import cake from "@/assets/report-card/cake.svg";
import calendarWhite from "@/assets/report-card/calendar-white.svg";
import downloadSimple from "@/assets/report-card/download-simple.svg";
import headset from "@/assets/report-card/headset.svg";
import heart from "@/assets/report-card/heart.svg";
import mapPinLine from "@/assets/report-card/map-pin-line.svg";
import mapPinLineWhite from "@/assets/report-card/map-pin-line-white.svg";
import palette from "@/assets/report-card/palette.svg";
import sealCheck from "@/assets/report-card/seal-check.svg";
import type { ExploreGatingContext } from "@/lib/storage";
import { useIntakeQuestions } from "../hooks/useIntake";
import { downloadReportPdf } from "../lib/download-report-pdf";
import {
  SEGMENT_LABEL,
  TRAIT_MEANING,
  useReportMatchCards,
  type ReportMatchCard,
} from "./ReportCardSections";

/**
 * The Report Card's "journey report" panel — Figma "career" file node 498:572 (frame
 * "journey-report", 498:450): a header strip, a purple hero band (name, segment, location, date,
 * RIASEC code), a Profile tag row, an Assessment bars column beside "Your selections &
 * explorations" cards. Fixed 827px in Figma; here it is a slightly wider, responsive panel. Every value comes from what the app already has: the student's profile, their intake
 * answers, the assessment result and the stored recommendation runs (titles only — no
 * percentages for the MVP). The Figma frame's outer "white-card" and its Explore Path / Report
 * card tabs are not rendered here: the panel stands alone on the page, per the earlier request.
 * The row under it has "Explore Path" (back to the Explore Path screens), "Download" (saves the
 * panel as "<name>-Journey-Report.pdf", generated in the browser) and "Talk to counsellor"
 * (disabled — no backend behind it yet).
 */

const TRAIT_ORDER: RiasecScale[] = ["R", "I", "A", "S", "E", "C"];

// Figma's caption colours the three top traits orange / blue / purple, in that order.
const TOP_TRAIT_COLOURS = ["text-[#e07a24]", "text-[#1a73e8]", "text-[#8e24aa]"] as const;

const REPORT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Intake answers shown as Profile tags, per segment — [question_key, Figma icon]. Sensitive
// answers (marks band, constraints) are deliberately never shown.
const PROFILE_TAG_KEYS: Record<UserProfile["segment"], Array<[string, string]>> = {
  explorer: [
    ["school_board", bookOpenText],
    ["favorite_subject", heart],
    ["flow_activity", palette],
  ],
  pathfinder: [
    ["education_stage", bookOpenText],
    ["current_stream", heart],
    ["preferred_work_style", palette],
  ],
  launcher: [
    ["education_level", bookOpenText],
    ["field_of_study", palette],
    ["current_goal", heart],
  ],
};

const ACRONYMS = new Set(["cbse", "icse", "ib", "cma", "ca", "mba", "it"]);

// Single-choice answers are stored as option values ("state_board"); short-text answers are the
// student's own words and shown as typed.
function humanizeAnswer(value: string): string {
  if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(value)) return value;
  return value
    .split("_")
    .map((word) =>
      ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function ProfileTag({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-[6px] border border-border bg-[#f8f6fd] px-2 py-[5px]">
      <img src={icon} alt="" aria-hidden="true" className="size-[11px] shrink-0" />
      <p className="font-display text-[11px] text-foreground">{label}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <p className="font-display text-[11px] font-medium text-brand uppercase">{children}</p>;
}

export type ReportPanelProfile = Pick<
  UserProfile,
  "firstName" | "segment" | "ageAtOnboarding" | "city" | "state" | "countryCode"
>;

/**
 * The report panel itself — pure presentation, so the student's own Report Card and a counselor's
 * copy of it render identically. `profileAnswers` are raw intake answers by question key (single
 * choice values like "state_board" are humanized here; free text is shown as typed).
 */
export function JourneyReportPanel({
  result,
  profile,
  profileAnswers,
  matches,
  panelRef,
}: {
  result: AssessmentResult;
  profile: ReportPanelProfile | null;
  profileAnswers: Readonly<Record<string, string | undefined>>;
  matches: { cards: ReportMatchCard[]; isLoading: boolean; hasSnapshot: boolean };
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const reportDate = REPORT_DATE_FORMAT.format(new Date(result.createdAt));

  const topScales = [...TRAIT_ORDER]
    .sort((a, b) => (result.normalizedScores[b] ?? 0) - (result.normalizedScores[a] ?? 0))
    .slice(0, 3);

  const tags: Array<{ icon: string; label: string }> = [];
  if (profile) {
    tags.push({ icon: cake, label: `${profile.ageAtOnboarding} years` });
    tags.push({ icon: mapPinLine, label: profile.city });
    tags.push({
      icon: bank,
      label: `${profile.state}${profile.countryCode === "IN" ? ", India" : ""}`,
    });
    for (const [key, icon] of PROFILE_TAG_KEYS[profile.segment]) {
      const value = profileAnswers[key]?.trim();
      if (value) tags.push({ icon, label: humanizeAnswer(value) });
    }
  }

  const name = profile?.firstName ?? "Your report";

  return (
    <div
      ref={panelRef}
      className="overflow-hidden rounded-[12px] border border-border bg-[#f8f6fd] shadow-soft"
    >
      {/* Top header: wordmark + "Journey report" / date. */}
      <div className="flex h-[54px] items-center justify-between px-4">
        <span className="font-display text-2xl font-bold tracking-tight">
          <span className="text-brand">yuva</span>
          <span className="text-foreground">Path</span>
        </span>
        <div className="flex flex-col items-end gap-0.5">
          <p className="font-display text-[10px] text-brand uppercase">Journey report</p>
          <p className="font-display text-[9px] text-muted-foreground">{reportDate}</p>
        </div>
      </div>

      {/* Hero band. */}
      <div className="flex min-h-[132px] items-center justify-between gap-4 bg-[#5f3b9f] px-4 py-4 text-white">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[22px] leading-[26px]">{name}</p>
          {profile ? (
            <>
              <p className="font-display text-xs leading-[14px]">
                {SEGMENT_LABEL[profile.segment]}
              </p>
              <div className="flex items-center gap-1">
                <img src={mapPinLineWhite} alt="" aria-hidden="true" className="size-[11px]" />
                <p className="font-display text-[10px] opacity-90">
                  {profile.city}, {profile.state}
                  {profile.countryCode === "IN" ? ", India" : ""}
                </p>
              </div>
            </>
          ) : null}
          <div className="flex items-center gap-1">
            <img src={calendarWhite} alt="" aria-hidden="true" className="size-[11px]" />
            <p className="font-display text-[10px] opacity-90">{reportDate}</p>
          </div>
        </div>
        <p className="font-display text-5xl opacity-80">{result.resultCode}</p>
      </div>

      {/* Profile tags. */}
      {tags.length > 0 ? (
        <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
          <SectionTitle>Profile</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <ProfileTag key={tag.label} icon={tag.icon} label={tag.label} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Assessment beside Your selections & explorations. */}
      <div className="flex flex-col border-t border-border sm:flex-row">
        <div className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-2">
          <SectionTitle>Assessment</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {TRAIT_ORDER.map((scale) => {
              const percent = Math.round((result.normalizedScores[scale] ?? 0) * 100);
              const label = TRAIT_MEANING[scale].label;
              return (
                <div key={scale} className="flex items-center gap-4">
                  <p className="w-[84px] shrink-0 font-display text-[11px] text-foreground">
                    {label}
                  </p>
                  <div className="flex flex-1 items-center gap-2">
                    <div
                      className="flex h-2 flex-1 overflow-hidden rounded-[4px] bg-[#ece6ff]"
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${label} strength`}
                    >
                      <div
                        className="h-full rounded-[4px] bg-[#b5a2d7]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="w-[29px] shrink-0 text-right font-display text-[11px] text-[#9ca3af]">
                      {percent}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="font-display text-[11px] text-muted-foreground">
            <span className="text-brand">{result.resultCode}</span>
            {" - "}
            {topScales.map((scale, index) => (
              <span key={scale}>
                {index > 0 ? " • " : ""}
                <span className={TOP_TRAIT_COLOURS[index]}>{TRAIT_MEANING[scale].label}</span>
              </span>
            ))}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-2">
          <SectionTitle>Your selections &amp; explorations</SectionTitle>
          {matches.cards.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {matches.cards.map((card, index) => (
                <div
                  key={card.key}
                  className="flex min-h-[95px] items-center gap-2 rounded-[10px] border border-border bg-[#f8f6fd] p-2.5"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[#f8f6fd]">
                    <img
                      src={index === 0 ? bankCard : sealCheck}
                      alt=""
                      aria-hidden="true"
                      className="size-[14px]"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate font-display text-xs text-foreground" title={card.title}>
                      {card.title}
                    </p>
                    <p className="font-display text-[9px] text-brand">{card.tag}</p>
                    <p className="line-clamp-2 font-display text-[9px] text-[#1f2937]">
                      {card.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-display text-[11px] text-muted-foreground">
              {matches.isLoading
                ? "Loading your matches…"
                : matches.hasSnapshot
                  ? "Your top matches will show up here."
                  : "Open Explore Path to see your top matches here."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function JourneyReport({
  result,
  profile,
  gatingContext,
  profileSnapshotId,
  journeySessionId,
  onExplorePath,
  isExploring,
  exploreError,
}: {
  result: AssessmentResult;
  profile: UserProfile | null;
  gatingContext: ExploreGatingContext | null;
  profileSnapshotId: string | null;
  journeySessionId: string | null;
  onExplorePath: () => void;
  isExploring: boolean;
  exploreError: string | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const intakeQuery = useIntakeQuestions(journeySessionId);
  const matches = useReportMatchCards(profileSnapshotId, gatingContext);

  const profileAnswers: Record<string, string> = {};
  for (const question of intakeQuery.data?.questions ?? []) {
    const value = intakeQuery.data?.answers.find((answer) => answer.questionId === question.id)
      ?.answer.value;
    if (typeof value === "string") profileAnswers[question.questionKey] = value;
  }

  const handleDownload = async () => {
    const panel = panelRef.current;
    if (!panel) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadReportPdf(panel, profile?.firstName);
    } catch {
      setDownloadError("We couldn't create the PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <JourneyReportPanel
        result={result}
        profile={profile}
        profileAnswers={profileAnswers}
        matches={matches}
        panelRef={panelRef}
      />

      {/* Explore Path (back), Download (PDF) and Talk to counsellor (disabled — no backend yet). */}
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onExplorePath}
            disabled={isExploring}
            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-brand bg-[#f8f6fd] px-5 font-display text-base font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExploring ? "Loading…" : "Explore Path"}
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-brand px-5 font-display text-base font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDownloading ? "Preparing PDF…" : "Download"}
            <img src={downloadSimple} alt="" aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            disabled
            className="flex h-10 items-center justify-center gap-2 rounded-[14px] border border-brand bg-[#f8f6fd] px-5 font-display text-base font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            Talk to counsellor
            <img src={headset} alt="" aria-hidden="true" className="size-4" />
          </button>
        </div>
        {downloadError ? (
          <p className="font-display text-sm text-destructive">{downloadError}</p>
        ) : null}
        {exploreError ? (
          <p className="font-display text-sm text-destructive">{exploreError}</p>
        ) : null}
      </div>
    </div>
  );
}
