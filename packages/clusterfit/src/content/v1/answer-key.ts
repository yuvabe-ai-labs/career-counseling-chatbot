// Source: Pathfinder questionnaire, "Answer key (facilitators only)". SERVER-ONLY: never include
// this module in a response DTO or the web bundle.
//
// One deliberate change from the doc, approved in docs/clusterfit-prototype-plan.md §16.1 (D2):
// MEC4 (see-saw) is "A". 30 kg × 2 m = 20 kg × 3 m = 60, so the see-saw stays balanced; the doc's
// key prints "B".
import type { AptitudeOptionKey } from "./aptitude-items.js";

export const APTITUDE_ANSWER_KEY: Readonly<Record<string, AptitudeOptionKey>> = {
  NUM1: "A",
  NUM2: "C",
  NUM3: "D",
  NUM4: "A",
  VER1: "B",
  VER2: "D",
  VER3: "C",
  VER4: "A",
  LOG1: "C",
  LOG2: "A",
  LOG3: "C",
  LOG4: "D",
  MEC1: "D",
  MEC2: "B",
  MEC3: "A",
  MEC4: "A",
  PRA1: "D",
  PRA2: "A",
  PRA3: "C",
  PRA4: "B",
};
