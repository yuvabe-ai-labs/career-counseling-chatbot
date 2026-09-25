import { assessmentModule } from "@yuvapath/assessment";
import { counselorModule } from "@yuvapath/counselor";
import { evaluationModule } from "@yuvapath/evaluation";
import { knowledgeModule } from "@yuvapath/knowledge";
import { recommendationsModule } from "@yuvapath/recommendations";
import { safetyModule } from "@yuvapath/safety";
import type { ModuleDescriptor } from "@yuvapath/contracts";

export const modules: ModuleDescriptor[] = [
  assessmentModule,
  recommendationsModule,
  knowledgeModule,
  counselorModule,
  safetyModule,
  evaluationModule,
];
