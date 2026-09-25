import { useQuery } from "@tanstack/react-query";
import {
  getCounselorStudentReport,
  getCounselorStudents,
  type CounselorStudentListFilters,
} from "../api/counselor-students";

export function useCounselorStudents(filters: CounselorStudentListFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["counselor-students", filters],
    queryFn: () => getCounselorStudents(filters),
    enabled,
    retry: false,
  });
}

export function useCounselorStudentReport(studentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["counselor-student-report", studentId],
    queryFn: () => getCounselorStudentReport(studentId as string),
    enabled: enabled && Boolean(studentId),
    retry: false,
  });
}
