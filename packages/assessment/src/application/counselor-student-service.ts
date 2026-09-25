import type { CounselorStudentListResponse, CounselorStudentReportResponse } from "@yuvapath/contracts";
import type { AssessmentRepository } from "./assessment-repository.js";
import type { CounselorDirectory } from "./counselor-directory.js";
import type {
  CounselorStudentListFilters,
  CounselorStudentRepository,
} from "./counselor-student-repository.js";
import { counselorNotAuthorized, counselorStudentNotFound } from "./errors.js";
import type { UserProfileRepository } from "./user-profile-repository.js";

// Intake answers the Report Card's Profile tags read, per segment. Sensitive answers (marks band,
// constraints) are deliberately absent: they never leave the student's own session.
const REPORT_ANSWER_KEYS = [
  "school_board",
  "favorite_subject",
  "flow_activity",
  "education_stage",
  "current_stream",
  "preferred_work_style",
  "education_level",
  "field_of_study",
  "current_goal",
] as const;

export type CounselorStudentServiceOptions = {
  counselorDirectory: CounselorDirectory;
  repository: CounselorStudentRepository;
  assessmentRepository: AssessmentRepository;
  userProfileRepository: UserProfileRepository;
};

/**
 * Backs the counselor "View Students" screen (Figma node 888:8336): the student list + filters
 * (listStudents) and the per-student report a "View Profile" click opens (getStudentReport).
 * Both re-verify the caller against CounselorDirectory on every call, the same pattern
 * CounselorDashboardService already uses — there is no separate per-counselor student
 * assignment table in this schema (operations.staff_role_assignments only gates whether the
 * caller holds an active counselor role at all), so an active counselor can read any student,
 * exactly as CounselorDashboardService's aggregate stats already do.
 */
export class CounselorStudentService {
  private readonly counselorDirectory: CounselorDirectory;
  private readonly repository: CounselorStudentRepository;
  private readonly assessmentRepository: AssessmentRepository;
  private readonly userProfileRepository: UserProfileRepository;

  constructor(options: CounselorStudentServiceOptions) {
    this.counselorDirectory = options.counselorDirectory;
    this.repository = options.repository;
    this.assessmentRepository = options.assessmentRepository;
    this.userProfileRepository = options.userProfileRepository;
  }

  async listStudents(
    counselorId: string,
    filters: CounselorStudentListFilters,
  ): Promise<CounselorStudentListResponse> {
    await this.assertActiveCounselor(counselorId);
    return this.repository.listStudents(filters);
  }

  async getStudentReport(
    counselorId: string,
    studentId: string,
  ): Promise<CounselorStudentReportResponse> {
    await this.assertActiveCounselor(counselorId);
    const profile = await this.userProfileRepository.findByUserId(studentId);
    if (!profile) {
      throw counselorStudentNotFound();
    }
    const [result, extras] = await Promise.all([
      this.assessmentRepository.findLatestRiasecResultForUser(studentId),
      this.repository.findReportExtras(studentId, REPORT_ANSWER_KEYS),
    ]);
    return {
      profile: {
        userId: profile.userId,
        firstName: profile.firstName,
        segment: profile.segment,
        ageAtOnboarding: profile.ageAtOnboarding,
        city: profile.city,
        state: profile.state,
        countryCode: profile.countryCode,
      },
      result,
      profileAnswers: extras.profileAnswers,
      matches: extras.matches,
    };
  }

  private async assertActiveCounselor(counselorId: string): Promise<void> {
    const isActive = await this.counselorDirectory.isActiveCounselor(counselorId);
    if (!isActive) {
      throw counselorNotAuthorized();
    }
  }
}
