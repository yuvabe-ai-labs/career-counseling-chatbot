import type { ModuleDescriptor } from "@yuvapath/contracts";

export { SAFETY_POLICY_VERSION } from "./domain/safety-policy.js";
export * from "./infrastructure/postgres-approved-safety-copy-reader.js";

/** Module 5: approved safety copy, read by the clusterfit chat's wellbeing message. */
export const safetyModule: ModuleDescriptor = {
  code: "m5-safety",
  name: "Safety",
  packageName: "@yuvapath/safety",
  status: "in_progress",
};
