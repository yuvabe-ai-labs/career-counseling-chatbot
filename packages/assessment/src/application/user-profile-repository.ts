import type { UserProfile } from "@yuvapath/contracts";

export type UpsertUserProfileRecord = {
  userId: string;
  firstName: string;
  ageAtOnboarding: number;
  ageBand: string;
  city: string;
  state: string;
  homeDistrict: string | undefined;
  countryCode: string;
  segment: string;
  selfStage: string;
  profileStatus: "active";
  now: string;
};

export type UserProfileRepository = {
  upsert(input: UpsertUserProfileRecord): Promise<UserProfile>;
  findByUserId(userId: string): Promise<UserProfile | null>;
};
