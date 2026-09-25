import type { College } from "@yuvapath/contracts";

export type CollegeFilters = {
  state?: string;
  pathwayId?: string;
  discipline?: string;
  limit?: number;
};

export interface CollegeRepository {
  list(filters: CollegeFilters): Promise<readonly College[]>;
}

export function isStudentVisibleCollege(college: College): boolean {
  return college.verificationStatus === "verified";
}
