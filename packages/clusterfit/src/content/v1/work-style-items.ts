// Source: Pathfinder questionnaire, Part D (20 items). (R) items are reverse-scored at scoring
// time (v -> 3 - v); the stored answer stays as ticked. Dimension and reverse flag are facilitator-only.
import type { WorkStyleDimension } from "./clusters.js";

export type WorkStyleItem = {
  itemKey: string;
  position: number;
  dimension: WorkStyleDimension;
  reverse: boolean;
  text: string;
};

export const WORK_STYLE_ITEMS: readonly WorkStyleItem[] = [
  {
    itemKey: "D1",
    position: 1,
    dimension: "social",
    reverse: false,
    text: "I feel energised after spending time with a group of people.",
  },
  {
    itemKey: "D2",
    position: 2,
    dimension: "initiative",
    reverse: false,
    text: "When no one takes charge, I step up.",
  },
  {
    itemKey: "D3",
    position: 3,
    dimension: "order",
    reverse: false,
    text: "I keep my things and my work neat and in order.",
  },
  {
    itemKey: "D4",
    position: 4,
    dimension: "curiosity",
    reverse: false,
    text: 'I ask "why" or "how" a lot, even outside class.',
  },
  {
    itemKey: "D5",
    position: 5,
    dimension: "steadiness",
    reverse: false,
    text: "I stay calm when things go wrong.",
  },
  {
    itemKey: "D6",
    position: 6,
    dimension: "social",
    reverse: false,
    text: "I notice when someone is upset and try to help.",
  },
  {
    itemKey: "D7",
    position: 7,
    dimension: "initiative",
    reverse: false,
    text: "I like trying out my own ideas even if they may fail.",
  },
  {
    itemKey: "D8",
    position: 8,
    dimension: "order",
    reverse: false,
    text: "I check my work for mistakes before I hand it in.",
  },
  {
    itemKey: "D9",
    position: 9,
    dimension: "curiosity",
    reverse: false,
    text: "I enjoy learning things that will not come in the exam.",
  },
  {
    itemKey: "D10",
    position: 10,
    dimension: "steadiness",
    reverse: false,
    text: "If I fail at something, I try again.",
  },
  {
    itemKey: "D11",
    position: 11,
    dimension: "social",
    reverse: true,
    text: "I would rather work alone than in a team.",
  },
  {
    itemKey: "D12",
    position: 12,
    dimension: "initiative",
    reverse: true,
    text: "I wait for others to tell me what to do.",
  },
  {
    itemKey: "D13",
    position: 13,
    dimension: "order",
    reverse: true,
    text: "I get bored with careful, step-by-step work.",
  },
  {
    itemKey: "D14",
    position: 14,
    dimension: "curiosity",
    reverse: true,
    text: "I prefer doing things the way they have always been done.",
  },
  {
    itemKey: "D15",
    position: 15,
    dimension: "steadiness",
    reverse: true,
    text: "Pressure or a deadline makes me freeze.",
  },
  {
    itemKey: "D16",
    position: 16,
    dimension: "social",
    reverse: false,
    text: "I find it easy to start a conversation with someone new.",
  },
  {
    itemKey: "D17",
    position: 17,
    dimension: "initiative",
    reverse: false,
    text: "I enjoy convincing others to join my plan.",
  },
  {
    itemKey: "D18",
    position: 18,
    dimension: "order",
    reverse: false,
    text: "I follow the plan or timetable I make for myself.",
  },
  {
    itemKey: "D19",
    position: 19,
    dimension: "curiosity",
    reverse: false,
    text: "I like trying new foods, places or tools.",
  },
  {
    itemKey: "D20",
    position: 20,
    dimension: "steadiness",
    reverse: false,
    text: "I can keep working on a boring task until it is finished.",
  },
];
