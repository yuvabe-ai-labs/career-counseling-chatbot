import type { ModuleDescriptor } from "@yuvapath/contracts";

export * from "./application/index.js";
export * from "./http/index.js";
export * from "./infrastructure/index.js";

export const counselorModule: ModuleDescriptor = {
  code: "m4",
  name: "AI Counselor",
  packageName: "@yuvapath/counselor",
  status: "in_progress",
};
