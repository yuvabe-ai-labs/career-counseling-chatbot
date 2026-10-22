// Source: Pathfinder questionnaire, Part E (choose and rank the top 3 of 9). Unscored. In this
// prototype the Gemini Live guide asks it during the chat (plan §18.2).

export const VALUE_CARD_KEYS = [
  "steady_income",
  "earn_early",
  "stay_close_home",
  "help_community",
  "own_boss",
  "learn_grow",
  "respect",
  "creative_freedom",
  "travel",
] as const;
export type ValueCardKey = (typeof VALUE_CARD_KEYS)[number];

export const VALUE_CARDS: readonly { key: ValueCardKey; text: string }[] = [
  { key: "steady_income", text: "A steady income and job security" },
  { key: "earn_early", text: "Earning well as early as possible" },
  { key: "stay_close_home", text: "Staying close to my family and home place" },
  { key: "help_community", text: "Helping others or improving my community" },
  { key: "own_boss", text: "Being my own boss" },
  { key: "learn_grow", text: "Learning and growing in my field" },
  { key: "respect", text: "Respect and recognition from others" },
  { key: "creative_freedom", text: "Freedom to be creative" },
  { key: "travel", text: "Chances to travel or live in new places" },
];
