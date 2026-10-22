// Copied from the Gemini Live POC (gemini-live-api-examples/gemini-live-genai-python-sdk/yuvapath.py,
// conversation_context v2) with the v3 additions for Part E (plan §18.2): the values_top3
// schema property and TOPICS entry. Everything else must match the POC (parity tests).

export const RESPONSE_SCHEMA_V3 = {
  properties: {
    schema_version: {
      const: "3",
      type: "string",
    },
    class_level: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              enum: ["class_9", "class_10", "class_11", "class_12", "other"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    school_board: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              enum: ["cbse", "state_board", "icse", "other"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    current_stream: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              enum: [
                "science_pcm",
                "science_pcb",
                "commerce",
                "arts_humanities",
                "vocational",
                "not_decided",
                "other",
              ],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    stream_interest: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                enum: [
                  "science_pcm",
                  "science_pcb",
                  "commerce",
                  "arts_humanities",
                  "vocational",
                  "not_decided",
                ],
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    subjects_enjoyed: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    marks: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              properties: {
                low: {
                  maximum: 100,
                  minimum: 0,
                  type: "number",
                },
                high: {
                  maximum: 100,
                  minimum: 0,
                  type: "number",
                },
              },
              required: ["low", "high"],
              type: "object",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    enjoyed_activities: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    strengths: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    wants_to_improve: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    current_challenges: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    careers_mentioned: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                properties: {
                  name: {
                    type: "string",
                  },
                  stance: {
                    enum: ["interested", "considering", "not_interested"],
                    type: "string",
                  },
                  reason: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                  },
                },
                required: ["name", "stance", "reason"],
                type: "object",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    learning_routes: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              properties: {
                open_to: {
                  items: {
                    enum: [
                      "complete_class_12",
                      "degree",
                      "diploma",
                      "certificate_course",
                      "vocational_training",
                      "apprenticeship",
                      "work_after_school",
                      "undecided",
                    ],
                    type: "string",
                  },
                  type: "array",
                },
                not_open_to: {
                  items: {
                    enum: [
                      "complete_class_12",
                      "degree",
                      "diploma",
                      "certificate_course",
                      "vocational_training",
                      "apprenticeship",
                      "work_after_school",
                      "undecided",
                    ],
                    type: "string",
                  },
                  type: "array",
                },
              },
              required: ["open_to", "not_open_to"],
              type: "object",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    location: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              description:
                "Studying and working later can differ (e.g. study near home, work anywhere after a degree).",
              properties: {
                study: {
                  anyOf: [
                    {
                      properties: {
                        preference: {
                          enum: ["same_city", "same_state", "anywhere_in_india", "not_sure"],
                          type: "string",
                        },
                        strength: {
                          enum: ["preference", "current_constraint", "firm_constraint"],
                          type: "string",
                        },
                      },
                      required: ["preference", "strength"],
                      type: "object",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                work: {
                  anyOf: [
                    {
                      properties: {
                        preference: {
                          enum: ["same_city", "same_state", "anywhere_in_india", "not_sure"],
                          type: "string",
                        },
                        strength: {
                          enum: ["preference", "current_constraint", "firm_constraint"],
                          type: "string",
                        },
                      },
                      required: ["preference", "strength"],
                      type: "object",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
              },
              required: ["study", "work"],
              type: "object",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    earning: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              description: "A need to earn soon is distinct from a wish to earn by some age.",
              properties: {
                urgency: {
                  enum: ["need", "wish"],
                  type: "string",
                },
                by_age: {
                  anyOf: [
                    {
                      type: "integer",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                alongside_study: {
                  anyOf: [
                    {
                      enum: ["needed", "wanted", "not_wanted"],
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
              },
              required: ["urgency", "by_age", "alongside_study"],
              type: "object",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    constraints: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              items: {
                enum: [
                  "fees",
                  "distance",
                  "family_expectations",
                  "entrance_exam",
                  "language",
                  "responsibilities",
                  "other",
                ],
                type: "string",
              },
              type: "array",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    seeks_aid: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              enum: ["yes", "no"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    decision_confidence: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              enum: ["very_confident", "somewhat_confident", "confused", "starting_from_zero"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    support_needed: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              enum: [
                "choose_stream",
                "understand_strengths",
                "study_plan",
                "career_ideas",
                "scholarship_or_aid",
                "not_sure",
                "stream_choice",
                "career_shortlist",
                "college_pathway",
                "exam_plan",
                "aid_options",
              ],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
    notes: {
      items: {
        type: "string",
      },
      maxItems: 5,
      type: "array",
    },
    open_questions: {
      items: {
        type: "string",
      },
      maxItems: 3,
      type: "array",
    },
    wellbeing_flag: {
      type: "boolean",
    },
    values_top3: {
      properties: {
        status: {
          enum: ["known", "unknown", "declined", "not_applicable"],
          type: "string",
        },
        value: {
          anyOf: [
            {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  value: {
                    type: "string",
                    enum: [
                      "steady_income",
                      "earn_early",
                      "stay_close_home",
                      "help_community",
                      "own_boss",
                      "learn_grow",
                      "respect",
                      "creative_freedom",
                      "travel",
                    ],
                  },
                  rank: {
                    type: "integer",
                    enum: [1, 2, 3],
                  },
                },
                required: ["value", "rank"],
              },
            },
            {
              type: "null",
            },
          ],
        },
        certainty: {
          anyOf: [
            {
              enum: ["firm", "tentative"],
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        evidence: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["status", "value", "certainty", "evidence"],
      type: "object",
    },
  },
  required: [
    "schema_version",
    "class_level",
    "school_board",
    "current_stream",
    "stream_interest",
    "subjects_enjoyed",
    "marks",
    "enjoyed_activities",
    "strengths",
    "wants_to_improve",
    "current_challenges",
    "careers_mentioned",
    "learning_routes",
    "location",
    "earning",
    "constraints",
    "seeks_aid",
    "decision_confidence",
    "support_needed",
    "notes",
    "open_questions",
    "wellbeing_flag",
    "values_top3",
  ],
  type: "object",
} as const;

export const TOPICS: Readonly<Record<string, string>> = {
  support_needed: "what they would most like help with right now",
  class_level: "which class they are in",
  school_board: "their school board",
  current_stream: "their stream or subject group (for science: maths, biology or both)",
  stream_interest: "which stream they are considering for Class 11",
  subjects_enjoyed: "which school subjects they enjoy",
  enjoyed_activities: "what they enjoy doing, in or outside school",
  strengths: "what they feel they are good at, in or outside school",
  wants_to_improve: "anything they would like to get better at",
  current_challenges: "anything that feels hard for them right now",
  careers_mentioned: "careers or fields they are curious about",
  learning_routes:
    "what they are thinking about after school (Class 12, degree, diploma, training, work)",
  location: "where they would like to study, and later work",
  earning: "whether and when they need or want to start earning",
  constraints: "anything that might affect their choices, like cost, distance or family",
  seeks_aid: "whether they would like to see scholarship or financial-aid options",
  marks: "roughly what percentage they got in their last exam (fine to skip)",
  decision_confidence: "how sure they feel about their next step",
  values_top3:
    "the three things that matter most to them in work (a steady income, earning early, staying near home, helping others, being their own boss, learning, respect, creativity or travel)",
};

export const ESSENTIAL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  explorer: [
    "support_needed",
    "stream_interest",
    "subjects_enjoyed",
    "enjoyed_activities",
    "strengths",
    "careers_mentioned",
  ],
  pathfinder: [
    "support_needed",
    "current_stream",
    "subjects_enjoyed",
    "enjoyed_activities",
    "strengths",
    "careers_mentioned",
  ],
};

export const RECOMMENDATION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  explorer: [],
  pathfinder: ["marks", "location", "seeks_aid"],
};

/** [band, lower inclusive, upper exclusive]. Where 60% belongs is an open team decision (POC note). */
export const MARKS_BANDS: readonly (readonly [string, number, number])[] = [
  ["below_50", 0, 50],
  ["50_60", 50, 60],
  ["60_75", 60, 75],
  ["75_90", 75, 90],
  ["90_plus", 90, 100.01],
];

export const SEGMENT_CLASSES: Readonly<Record<string, readonly string[]>> = {
  explorer: ["class_9", "class_10"],
  pathfinder: ["class_11", "class_12"],
};

export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  explorer: "Classes 9–10",
  pathfinder: "Classes 11–12",
};

export const EXPLORER_SUPPORT = [
  "choose_stream",
  "understand_strengths",
  "study_plan",
  "career_ideas",
  "scholarship_or_aid",
  "not_sure",
] as const;

export const PATHFINDER_SUPPORT = [
  "stream_choice",
  "career_shortlist",
  "college_pathway",
  "exam_plan",
  "aid_options",
  "not_sure",
] as const;

export const SKIPPED_TOPICS: Readonly<Record<string, readonly string[]>> = {
  explorer: ["marks"],
  pathfinder: [],
};

export const MAX_COVERAGE_CHECKS = 2;

export const KICKOFF_TEXT =
  "The student has just joined. Greet them and begin, following your instructions.";

/** The POC's results for the tools it answers without the transcript (LIVE_TOOL_HANDLERS). */
export const TOOL_RESULTS: Readonly<Record<string, string>> = {
  end_discovery: "Conversation marked complete. Do not ask further questions.",
  flag_wellbeing_concern: "Flag received. The app is showing approved support information.",
};

export const LIVE_TOOL_DECLARATIONS = [
  {
    name: "end_discovery",
    description:
      "Call once, after the closing summary and goodbye, when the context-discovery conversation is complete.",
  },
  {
    name: "check_coverage",
    description:
      "Call when you think you have covered everything, before the closing summary. Returns the topics that are still not covered, to ask about before closing.",
  },
  {
    name: "flag_wellbeing_concern",
    description:
      "Call immediately if the student may harm themselves, is being harmed, or is in serious distress.",
  },
] as const;

/** The POC's own coverage_instruction outputs, used by the parity tests. */
export const POC_COVERAGE_EXAMPLES = {
  empty: "Everything is covered. Continue speaking now with the closing summary.",
  two: "Not covered yet: topic one; topic two. Continue speaking now: ask about the first of these. Then ask about the rest naturally, one per turn (you may combine two closely related ones). Skip any the student declines, and stop if they want to stop. Then give the closing summary. Do not call check_coverage again.",
} as const;
