// Student-facing wording from docs/Pathfinder Student Booklet.docx (paper verbs such as "tick" and
// "circle" changed to "choose"). Cluster and dimension codes never appear here.

/** Short names for the progress steps at the top of /clusterfit. */
export const STEP_LABELS = {
  A: "About you",
  B: "Activities",
  C: "Puzzles",
  D: "Work style",
} as const;

export const PART_COPY = {
  A: {
    title: "Let's get to know you",
    instruction:
      "Chat with our guide by voice or by typing about you, your plans and what matters to you.",
    points: [
      "Takes about 5 minutes",
      "Speak or type in the language you are comfortable with",
      "There are no right or wrong answers",
    ],
  },
  B: {
    title: "Things I might enjoy",
    instruction:
      "Imagine you could spend a free day doing each activity below. Choose Yes if you would enjoy it. Choose Maybe if you are not sure, or have never tried it but are curious. Choose No if you would not enjoy it. There are no right answers.",
    prompt: "Would you enjoy…",
    perScreen: 6,
  },
  C: {
    title: "Puzzles about everyday life",
    instruction:
      "These are short puzzles about everyday situations. Choose the one best answer. Wrong answers do not lose marks, so make your best guess if you are unsure.",
    perScreen: 1,
  },
  D: {
    title: "How I like to work",
    instruction:
      "How much is each statement like you, most of the time? There are no good or bad styles. Every style suits some kind of work.",
    perScreen: 5,
  },
} as const;

/** Part E cards (doc wording). */
export const VALUE_CARD_TEXT: Record<string, string> = {
  steady_income: "A steady income and job security",
  earn_early: "Earning well as early as possible",
  stay_close_home: "Staying close to my family and home place",
  help_community: "Helping others or improving my community",
  own_boss: "Being my own boss",
  learn_grow: "Learning and growing in my field",
  respect: "Respect and recognition from others",
  creative_freedom: "Freedom to be creative",
  travel: "Chances to travel or live in new places",
};

/** Doc §"Reading the results": band language, never numbers or ranks. */
export const RESULT_COPY = {
  title: "Your career clusters",
  strong:
    "All 12 fields of work are shown, best match first. Your top 3 are highlighted: your interests, puzzle answers and work style point most strongly to these.",
  strongFallback:
    "All 12 fields of work are shown, best match first. Your top 3 are highlighted, but no field stands out strongly yet. Your profile is still open.",
  /** One plain phrase per card instead of a number (doc bands: ≥ 65, 50–64, below 50). */
  signal: {
    strong: "Strong match",
    explore: "Worth exploring",
    low: "Less of a match for now",
  },
};

/** Plain words for the chat's coded answers on the confirm card; anything else shows as written. */
export const SITUATION_VALUE_LABELS: Record<string, string> = {
  // What they want help with
  choose_stream: "choosing a stream",
  understand_strengths: "understanding my strengths",
  study_plan: "a study plan",
  career_ideas: "career ideas",
  scholarship_or_aid: "scholarships or financial help",
  stream_choice: "choosing a stream",
  career_shortlist: "shortlisting careers",
  college_pathway: "choosing a college or course",
  exam_plan: "planning for entrance exams",
  aid_options: "scholarships or financial help",
  not_sure: "not sure yet",
  // Board and stream
  cbse: "CBSE",
  icse: "ICSE",
  state_board: "State board",
  science_pcm: "Science with Maths",
  science_pcb: "Science with Biology",
  commerce: "Commerce",
  arts_humanities: "Arts / Humanities",
  vocational: "Vocational",
  not_decided: "not decided yet",
  // Routes after school
  complete_class_12: "finish Class 12",
  degree: "a degree",
  diploma: "a diploma",
  certificate_course: "a certificate course",
  vocational_training: "vocational training",
  apprenticeship: "an apprenticeship",
  work_after_school: "work after school",
  undecided: "undecided",
  // Where
  same_city: "my own city or town",
  same_state: "my own state",
  anywhere_in_india: "anywhere in India",
  // Practical things
  fees: "fees",
  distance: "distance",
  family_expectations: "family expectations",
  entrance_exam: "entrance exams",
  language: "language",
  responsibilities: "responsibilities at home",
  // How sure they feel
  very_confident: "very confident",
  somewhat_confident: "somewhat confident",
  confused: "a bit confused",
  starting_from_zero: "just starting to think about it",
};

/** Labels for the chat's fields on the confirm card (from the POC prompt's topics). */
export const SITUATION_FIELD_LABELS: Record<string, string> = {
  support_needed: "What you'd like help with",
  school_board: "School board",
  current_stream: "Your stream",
  stream_interest: "Stream you're thinking about",
  subjects_enjoyed: "Subjects you enjoy",
  enjoyed_activities: "Things you enjoy doing",
  strengths: "What you're good at",
  careers_mentioned: "Careers you're curious about",
  learning_routes: "Routes after school",
  location: "Where you'd like to study or work",
  constraints: "Things that may affect your choices",
  decision_confidence: "How sure you feel",
};
