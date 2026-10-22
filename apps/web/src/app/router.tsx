import { Navigate, createBrowserRouter } from "react-router-dom";
import { GuardianConsentPage, HomePage, OnboardingPage, SignInPage } from "@/features/assessment";
import { ClusterfitPage, ClusterfitResultsPage } from "@/features/clusterfit";
import { LandingPage } from "@/features/landing";

/**
 * The student journey: sign up or sign in (guardian consent for under-18s), then the clusterfit
 * chat, activities, puzzles and work style, then the career-cluster results.
 */
export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/sign-up", element: <OnboardingPage /> },
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/guardian-consent", element: <GuardianConsentPage /> },
  // Every auth path ends on /home, which forwards a signed-in student to the journey.
  { path: "/home", element: <HomePage /> },
  { path: "/clusterfit", element: <ClusterfitPage /> },
  { path: "/clusterfit/results", element: <ClusterfitResultsPage /> },
  // Unknown paths (including old bookmarks to removed pages) go to the landing page.
  { path: "*", element: <Navigate to="/" replace /> },
]);
