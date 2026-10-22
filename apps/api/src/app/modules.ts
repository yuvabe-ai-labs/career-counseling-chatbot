import { assessmentModule } from "@yuvapath/assessment";
import { clusterfitModule } from "@yuvapath/clusterfit";
import type { ModuleDescriptor } from "@yuvapath/contracts";
import { safetyModule } from "@yuvapath/safety";

export const modules: ModuleDescriptor[] = [assessmentModule, clusterfitModule, safetyModule];
