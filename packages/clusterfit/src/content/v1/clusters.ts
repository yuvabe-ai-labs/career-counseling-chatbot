// Source: docs/Pathfinder Career Exploration Questionnaire (Grades 9–12).docx, "The 12 career
// clusters" and "Cluster matrix". The array order is the doc's cluster number k (SCI = 1 … CON = 12),
// which drives the Part B item layout (cluster k owns items k, k+12, k+24, k+36).

export const CLUSTER_CODES = [
  "SCI",
  "ENG",
  "DIG",
  "HLT",
  "AGR",
  "BUS",
  "EDU",
  "GOV",
  "MED",
  "ART",
  "HOS",
  "CON",
] as const;
export type ClusterCode = (typeof CLUSTER_CODES)[number];

export const APTITUDE_DOMAINS = ["NUM", "VER", "LOG", "MEC", "PRA"] as const;
export type AptitudeDomain = (typeof APTITUDE_DOMAINS)[number];

export const WORK_STYLE_DIMENSIONS = [
  "social",
  "initiative",
  "order",
  "curiosity",
  "steadiness",
] as const;
export type WorkStyleDimension = (typeof WORK_STYLE_DIMENSIONS)[number];

export type ClusterDefinition = {
  code: ClusterCode;
  /** The doc's cluster number k, 1–12. Also the last tie-break (plan §16.1 D2). */
  order: number;
  name: string;
  exampleRoles: string;
  entryRoutes: string;
};

export const CLUSTERS: readonly ClusterDefinition[] = [
  {
    code: "SCI",
    order: 1,
    name: "Science and Research",
    exampleRoles: "Lab technician, quality tester, data analyst, scientist, science teacher",
    entryRoutes: "B.Sc., integrated M.Sc., lab technician diplomas, research fellowships",
  },
  {
    code: "ENG",
    order: 2,
    name: "Engineering and Manufacturing",
    exampleRoles:
      "Electrician, fitter, CNC operator, automobile mechanic, diploma and degree engineers",
    entryRoutes:
      "ITI trades, polytechnic diploma, B.Tech. via JEE and state exams, apprenticeships",
  },
  {
    code: "DIG",
    order: 3,
    name: "Computing and Digital",
    exampleRoles:
      "IT support, data operator, web and app developer, digital marketer, cybersecurity",
    entryRoutes:
      "Short certified courses, BCA, B.Sc. Computer Science, B.Tech., self-learning with portfolios",
  },
  {
    code: "HLT",
    order: 4,
    name: "Health, Wellness and Sports",
    exampleRoles:
      "ANM and GNM nurse, paramedic, pharmacist, physiotherapist, doctor, fitness trainer, sports coach",
    entryRoutes:
      "Nursing and paramedic diplomas, B.Pharm., BPT, MBBS via NEET, sports quotas and academies",
  },
  {
    code: "AGR",
    order: 5,
    name: "Agriculture, Environment and Natural Resources",
    exampleRoles:
      "Progressive farmer, dairy and poultry entrepreneur, agri-extension officer, forest guard, solar technician",
    entryRoutes:
      "B.Sc. Agriculture, horticulture and veterinary diplomas, forestry courses, Krishi Vigyan Kendra training",
  },
  {
    code: "BUS",
    order: 6,
    name: "Business, Finance and Enterprise",
    exampleRoles:
      "Shop and micro-enterprise owner, accountant, bank and insurance staff, sales manager, CA",
    entryRoutes:
      "B.Com., BBA, CA and CMA foundation, banking exams, small-business and cooperative training",
  },
  {
    code: "EDU",
    order: 7,
    name: "Education and Social Impact",
    exampleRoles:
      "Teacher, trainer, anganwadi and community worker, counsellor, NGO programme officer",
    entryRoutes: "D.El.Ed., B.Ed., B.A. and M.S.W., CTET and state TET, community fellowships",
  },
  {
    code: "GOV",
    order: 8,
    name: "Law, Governance and Public Service",
    exampleRoles:
      "Police, armed forces, forest and revenue services, lawyer, civil servant, panchayat functionary",
    entryRoutes:
      "NDA and other defence entries, SSC and state recruitment exams, UPSC, CLAT and law degrees",
  },
  {
    code: "MED",
    order: 9,
    name: "Media, Communication and Languages",
    exampleRoles:
      "Reporter, radio and video producer, content writer, translator, announcer, publisher",
    entryRoutes:
      "B.A. Journalism and Mass Communication, language degrees, community media training, portfolio-based entry",
  },
  {
    code: "ART",
    order: 10,
    name: "Arts, Design and Crafts",
    exampleRoles:
      "Artisan, tailor and fashion designer, animator, photographer, musician, graphic and product designer",
    entryRoutes:
      "Craft apprenticeships, design diplomas, UCEED and NID entrance, B.F.A., music and dance training",
  },
  {
    code: "HOS",
    order: 11,
    name: "Hospitality, Tourism and Personal Services",
    exampleRoles:
      "Cook and chef, hotel front office, tour guide, event planner, beautician, wellness therapist",
    entryRoutes:
      "Skill Council certification, hotel management diploma and degree, tourism courses, on-the-job training",
  },
  {
    code: "CON",
    order: 12,
    name: "Construction, Infrastructure and Transport",
    exampleRoles:
      "Mason, plumber, surveyor, site supervisor, civil engineer, architect, driver, logistics coordinator",
    entryRoutes:
      "ITI trades, civil diploma, B.Arch. and B.E. Civil, driving and logistics certifications",
  },
];

/** The doc's cluster matrix: two key aptitudes (A) and two key work styles (S) per cluster. */
export const CLUSTER_MATRIX: Readonly<
  Record<
    ClusterCode,
    {
      aptitudes: readonly [AptitudeDomain, AptitudeDomain];
      styles: readonly [WorkStyleDimension, WorkStyleDimension];
    }
  >
> = {
  SCI: { aptitudes: ["LOG", "NUM"], styles: ["curiosity", "steadiness"] },
  ENG: { aptitudes: ["MEC", "NUM"], styles: ["curiosity", "order"] },
  DIG: { aptitudes: ["LOG", "PRA"], styles: ["curiosity", "order"] },
  HLT: { aptitudes: ["PRA", "VER"], styles: ["social", "steadiness"] },
  AGR: { aptitudes: ["PRA", "MEC"], styles: ["steadiness", "initiative"] },
  BUS: { aptitudes: ["NUM", "PRA"], styles: ["initiative", "social"] },
  EDU: { aptitudes: ["VER", "PRA"], styles: ["social", "curiosity"] },
  GOV: { aptitudes: ["VER", "LOG"], styles: ["initiative", "order"] },
  MED: { aptitudes: ["VER", "PRA"], styles: ["curiosity", "social"] },
  ART: { aptitudes: ["MEC", "VER"], styles: ["curiosity", "initiative"] },
  HOS: { aptitudes: ["PRA", "VER"], styles: ["social", "order"] },
  CON: { aptitudes: ["MEC", "NUM"], styles: ["order", "steadiness"] },
};
