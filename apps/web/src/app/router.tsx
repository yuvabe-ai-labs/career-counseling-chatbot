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
import {
  CounselorForgotPasswordPage,
  CounselorHomePage,
  CounselorNewPasswordPage,
  CounselorSignInPage,
  CounselorStudentReportPage,
  CounselorStudentsPage,
} from "@/features/counselor";
import { LandingPage } from "@/features/landing";
import {
  CareerPage,
  CollegePage,
  ExplorePathPage,
  PathwayPage,
  PlanPage,
  ScholarshipPage,
  StreamPage,
} from "@/features/recommendations";

export const router = createBrowserRouter([
  // Temporary, simple entry point — see docs/architecture/counselor-auth-landing-page-plan.md.
  // Sign-up used to live at "/" directly; it moved to "/sign-up" so this could take its place.
  { path: "/", element: <LandingPage /> },
  { path: "/sign-up", element: <OnboardingPage /> },
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/guardian-consent", element: <GuardianConsentPage /> },
  { path: "/home", element: <HomePage /> },
  { path: "/intake-questions", element: <IntakeQuestionsPage /> },
  { path: "/riasec-assessment", element: <RiasecAssessmentPage /> },
  { path: "/riasec-results", element: <RiasecResultsPage /> },
  { path: "/explore-path", element: <ExplorePathPage /> },
  { path: "/explore-path/career", element: <CareerPage /> },
  { path: "/explore-path/stream", element: <StreamPage /> },
  { path: "/explore-path/pathway", element: <PathwayPage /> },
  { path: "/explore-path/college", element: <CollegePage /> },
  { path: "/explore-path/plan", element: <PlanPage /> },
  { path: "/explore-path/scholarship", element: <ScholarshipPage /> },
  { path: "/counselor/sign-in", element: <CounselorSignInPage /> },
  { path: "/counselor/forgot-password", element: <CounselorForgotPasswordPage /> },
  { path: "/counselor/new-password", element: <CounselorNewPasswordPage /> },
  { path: "/counselor/home", element: <CounselorHomePage /> },
  { path: "/counselor/students", element: <CounselorStudentsPage /> },
  { path: "/counselor/students/:studentId", element: <CounselorStudentReportPage /> },
]);
