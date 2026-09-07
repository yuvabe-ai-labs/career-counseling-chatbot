import yuvabeLogo from "@/assets/yuvabe-logo.png";

/**
 * Wordmark, from the Figma "career" file's own logo asset (node 139:3937 —
 * "yuvabe", not the app's earlier "Yuva Path" placeholder text/icon mark).
 */
export function Brand() {
  return <img src={yuvabeLogo} alt="yuvabe" className="h-9 w-auto shrink-0 sm:h-[52px]" />;
}

/** "Step X of Y" pill — Figma node 139:3938, right of the header logo. */
export function StepIndicator({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <span className="shrink-0 rounded-[14px] bg-background px-3 py-2 font-display text-sm text-muted-foreground">
      Step {step} of {totalSteps}
    </span>
  );
}
