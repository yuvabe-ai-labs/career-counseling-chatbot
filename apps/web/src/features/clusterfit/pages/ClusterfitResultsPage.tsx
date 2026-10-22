import { Navigate } from "react-router-dom";
import {
  Briefcase,
  ConciergeBell,
  FlaskConical,
  GraduationCap,
  HardHat,
  HeartPulse,
  Landmark,
  Laptop,
  Megaphone,
  Palette,
  Route,
  Sparkles,
  Sprout,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/assessment/state/session-context";
import { getClusterfitStudentResult } from "../api/clusterfit";
import { getStoredClusterfitSessionId } from "../lib/clusterfit-storage";
import { RESULT_COPY } from "../lib/copy";

type Cluster = {
  code: string;
  name: string;
  exampleRoles: string;
  entryRoutes: string;
  signal: keyof typeof RESULT_COPY.signal;
  recommended: boolean;
};

/** A picture for each field, so the page reads at a glance (codes themselves are never shown). */
const CLUSTER_ICONS: Record<string, LucideIcon> = {
  SCI: FlaskConical,
  ENG: Wrench,
  DIG: Laptop,
  HLT: HeartPulse,
  AGR: Sprout,
  BUS: Briefcase,
  EDU: GraduationCap,
  GOV: Landmark,
  MED: Megaphone,
  ART: Palette,
  HOS: ConciergeBell,
  CON: HardHat,
};

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const Icon = CLUSTER_ICONS[cluster.code] ?? Sparkles;
  const roles = cluster.exampleRoles.split(",").map((role) => role.trim());
  const top = cluster.recommended;
  return (
    <li
      className={cn(
        "flex animate-in flex-col gap-4 rounded-[1.2rem] border bg-background p-5 duration-300 fade-in sm:p-6",
        top ? "border-2 border-brand shadow-md ring-4 ring-brand/10" : "border-border shadow-sm",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl",
            top ? "bg-brand text-white" : "bg-brand/10 text-brand",
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg leading-snug font-semibold text-foreground">
            {cluster.name}
          </h3>
          <span
            className={cn(
              "self-start rounded-full px-2.5 py-0.5 text-xs font-semibold",
              cluster.signal === "strong"
                ? "bg-brand/10 text-brand"
                : "bg-muted text-muted-foreground",
            )}
          >
            {RESULT_COPY.signal[cluster.signal]}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Jobs at every level</span>
        <ul className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <li
              key={role}
              className="rounded-full bg-brand/5 px-3 py-1 text-sm text-foreground first-letter:uppercase"
            >
              {role}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-auto flex gap-2 text-sm text-muted-foreground">
        <Route className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          <span className="font-medium text-foreground">Ways in: </span>
          {cluster.entryRoutes}
        </span>
      </p>
    </li>
  );
}

/**
 * /clusterfit/results: the cluster recommendation, and the end of this iteration (plan §18.1 R4).
 * All 12 clusters, best first, three to a row on wide screens, with the top 3 highlighted (§18.1 R7). Each card has
 * a plain signal word and the doc's roles and routes; never numbers.
 */
export function ClusterfitResultsPage() {
  const studentSession = useSession();
  const sessionId = getStoredClusterfitSessionId();
  const query = useQuery({
    queryKey: ["clusterfit", sessionId, "result"],
    queryFn: () => getClusterfitStudentResult(sessionId!),
    enabled: Boolean(sessionId && studentSession.userId),
  });

  if (!studentSession.userId) return <Navigate to="/" replace />;
  if (!sessionId) return <Navigate to="/clusterfit" replace />;

  const result = query.data?.result;
  return (
    <main className="bg-hero-gradient flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex w-full max-w-7xl animate-in flex-col gap-8 duration-300 fade-in">
          {query.isError ? (
            <ErrorState
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : !result ? (
            <LoadingState />
          ) : (
            <>
              <header className="flex flex-col gap-3">
                <span className="flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Sparkles className="size-7" />
                </span>
                <h2 className="font-display text-3xl font-semibold text-foreground">
                  {RESULT_COPY.title}
                </h2>
                <p className="max-w-3xl text-muted-foreground">
                  {result.fallbackUsed ? RESULT_COPY.strongFallback : RESULT_COPY.strong}
                </p>
              </header>
              <ol className="grid gap-x-5 gap-y-7 pt-2 md:grid-cols-2 lg:grid-cols-3">
                {result.clusters.map((cluster) => (
                  <ClusterCard key={cluster.code} cluster={cluster} />
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
