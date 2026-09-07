import { createBrowserRouter } from "react-router-dom";
import {
  GuardianConsentPage,
  HomePage,
  IntakeQuestionsPage,
  OnboardingPage,
  RiasecAssessmentPage,
  RiasecResultsPage,
  SignInPage,
} from "@/features/assessment";

export const router = createBrowserRouter([
  { path: "/", element: <OnboardingPage /> },
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/guardian-consent", element: <GuardianConsentPage /> },
  { path: "/home", element: <HomePage /> },
  { path: "/intake-questions", element: <IntakeQuestionsPage /> },
  { path: "/riasec-assessment", element: <RiasecAssessmentPage /> },
  { path: "/riasec-results", element: <RiasecResultsPage /> },
]);
