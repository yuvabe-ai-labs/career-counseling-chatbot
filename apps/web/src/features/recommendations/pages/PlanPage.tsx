import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { PlanFitExplanation } from "@yuvanext/contracts";
import planCardArts from "@/assets/plan-card-arts.png";
import planCardCommerce from "@/assets/plan-card-commerce.png";
import planCardScience from "@/assets/plan-card-science.png";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { flowCardBandClass, flowCardClass } from "@/components/flow-card";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { getStoredExploreGatingContext, getStoredProfileSnapshotId } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/assessment";
import { PlanStepCard } from "../components/PlanStepCard";
import { usePlanRecommendation } from "../hooks/usePlanRecommendation";
import { isPlanStepDone, togglePlanStepDone } from "../lib/plan-step-progress";

function isPlanExplanation(explanation: unknown): explanation is PlanFitExplanation {
  return typeof explanation === "object" && explanation !== null && "generatedSteps" in explanation;
}

/** The 3 card treatments Figma node 611:147 ("plans") ships artwork for — cycled by step
 *  position, same approach as StreamPage's card styles (there's no per-step category to match
 *  a style to here, just an ordered checklist, so position is the only signal available). */
const PLAN_CARD_IMAGES = [
  { image: planCardArts, imageClassName: "h-full left-[-15.22%] top-[0.09%] w-[145.26%] max-w-none" },
  { image: planCardCommerce, imageClassName: "h-full left-[-11.87%] top-[6.02%] w-[145.26%] max-w-none" },
  { image: planCardScience, imageClassName: "h-full left-[-15.22%] top-[0.09%] w-[145.26%] max-w-none" },
];

/**
 * Figma node 611:147 ("plans"). Same card-grid treatment as StreamPage (StreamOptionCard's
 * sibling, PlanStepCard) rather than the previous numbered step-timeline: each generated step
 * (buildPlanRecommendationSet() always returns exactly one "plan" item with an ordered
 * generatedSteps list — plan-generation.ts) renders as its own checklist card, checkbox state
 * held client-side only (lib/plan-step-progress.ts — there's no backend concept of a step being
 * "done"). Card font sizes match ExploreOptionCard's scale, same as StreamPage.
 */
export function PlanPage() {
  const navigate = useNavigate();
  const session = useSession();
  const profileSnapshotId = getStoredProfileSnapshotId();
  const gatingContext = getStoredExploreGatingContext();
  const [, forceUpdate] = useState(0);

  const recommendationQuery = usePlanRecommendation(profileSnapshotId);

  if (!session.userId || !session.journeySessionId) {
    return <Navigate to="/" replace />;
  }
  if (!profileSnapshotId || !gatingContext) {
    return <Navigate to="/riasec-results" replace />;
  }

  const planItem = recommendationQuery.data?.items[0];
  const explanation = planItem && isPlanExplanation(planItem.explanation) ? planItem.explanation : null;
  const steps = explanation ? [...explanation.generatedSteps].sort((a, b) => a.stepOrder - b.stepOrder) : [];

  return (
    <main className="flex min-h-screen flex-col bg-page">
      <AppHeader />
      <div className={flowCardBandClass}>
        <div className={cn(flowCardClass, "border border-border")}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void navigate("/explore-path")}
              aria-label="Back to Explore Path"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-foreground shadow-sm"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
            <h1 className="font-display text-2xl leading-[1.2] font-bold text-foreground sm:text-3xl lg:text-[34px]">
              Plan
            </h1>
          </div>

          {planItem ? (
            <p className="mt-5 font-display text-sm leading-[1.4] text-foreground sm:text-base lg:text-lg">
              {planItem.title}
            </p>
          ) : null}

          <div className="mt-6">
            {recommendationQuery.isPending ? (
              <LoadingState />
            ) : recommendationQuery.isError ? (
              <ErrorState
                message={getErrorMessage(recommendationQuery.error, "We couldn't load your plan.")}
                onRetry={() => void recommendationQuery.refetch()}
              />
            ) : explanation && steps.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-16">
                {steps.map((step, index) => {
                  const { image, imageClassName } = PLAN_CARD_IMAGES[index % PLAN_CARD_IMAGES.length]!;
                  const done = isPlanStepDone(explanation.templateId, step.stepOrder);
                  return (
                    <PlanStepCard
                      key={step.stepOrder}
                      title={step.timeWindow + (step.isOptional ? " · Optional" : "")}
                      description={step.actionText}
                      image={image}
                      imageClassName={imageClassName}
                      done={done}
                      onToggle={() => {
                        togglePlanStepDone(explanation.templateId, step.stepOrder);
                        forceUpdate((tick) => tick + 1);
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-center font-display text-base text-muted-foreground">
                We don't have a plan template ready for your profile yet — check back soon.
              </p>
            )}
          </div>

          <p className="mt-6 text-center font-display text-sm leading-[1.4] text-muted-foreground">
            "Explore your options. Shape your future."
          </p>
        </div>
      </div>
    </main>
  );
}
