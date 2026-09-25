// One-off generator: writes data/seed/knowledge/streams/2026-09-18-tn-stream-catalogue/
// {manifest.json,records.json}. Run once; the output is a static, checked-in seed file like
// every other data/seed/knowledge/streams/<date>/ batch. Re-running regenerates byte-identical
// output (all ids are hardcoded below, not randomly generated at run time), except for
// createdAt.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DATASET_VERSION_ID = "2a363b67-dab4-43a6-b676-ebaab38b539a";
const SOURCE_ID = "7c8485d5-eda8-4481-82cd-463fa6907875";
const OUT_DIR = "data/seed/knowledge/streams/2026-09-18-tn-stream-catalogue";

// ---------------------------------------------------------------- stream options (vocabulary)
// "explorer" options are the subject groups/vocational trades a student picks after Class 10
// (before Classes 11-12). "general" options are the broad UG discipline-families a student
// picks after Class 12 — used as the segment=null fallback, which loadStreams() (
// recommendation-data-source.ts) serves to both pathfinder and launcher since neither has its
// own override rows. All of these are standard, real Tamil Nadu/Indian school-leaving and
// undergraduate categories, not invented data.
const EXPLORER_OPTIONS = [
  ["school-science-pcm", "Science with Mathematics (PCM)",
    "Physics, Chemistry and Mathematics after Class 10 — the standard foundation for engineering, architecture and other quantitative degrees."],
  ["school-science-pcb", "Science with Biology (PCB)",
    "Physics, Chemistry and Biology after Class 10 — the standard foundation for medicine, nursing, pharmacy and other life-science degrees."],
  ["school-science-cs", "Science with Computer Science",
    "Physics, Chemistry, Mathematics plus Computer Science after Class 10 — for students aiming at a computing-heavy engineering or computer-applications degree."],
  ["school-commerce", "Commerce",
    "Accountancy, Commerce and Economics after Class 10 — the standard route into B.Com, BBA and other business degrees."],
  ["school-commerce-maths", "Commerce with Mathematics",
    "Commerce and Economics alongside Mathematics after Class 10 — keeps quantitative options such as BBA, analytics and actuarial science open alongside commerce degrees."],
  ["school-humanities", "Humanities / Arts",
    "History, Political Science, Economics and language subjects after Class 10 — the standard route into BA, law and civil-services-oriented degrees."],
  ["school-fine-arts", "Fine Arts & Visual Arts",
    "Drawing, painting and applied-art subjects offered after Class 10 in schools with a fine-arts stream — a foundation for design and visual-arts degrees."],
  ["vocational-it", "Vocational: Information Technology",
    "NSQF-aligned vocational Information Technology subject after Class 10 — applied computing and entry-level IT skills alongside regular academics."],
  ["vocational-healthcare", "Vocational: Healthcare",
    "NSQF-aligned vocational Healthcare subject after Class 10 — foundational patient-care and health-support skills."],
  ["vocational-electrical", "Vocational: Electrical & Electronics",
    "NSQF-aligned vocational Electrical & Electronics Technology subject after Class 10 — applied wiring, installation and maintenance skills."],
  ["vocational-agriculture", "Vocational: Agriculture",
    "NSQF-aligned vocational Agriculture subject after Class 10 — practical crop, soil and farm-management skills."],
  ["school-physical-education", "Physical Education & Sports",
    "Physical Education as a main subject after Class 10 — for students aiming at sports science, coaching or physical-education degrees."],
];

const GENERAL_OPTIONS = [
  ["engineering-technology", "Engineering & Technology (B.E./B.Tech)",
    "Undergraduate engineering degrees — Computer Science, Mechanical, Civil, Electrical, Electronics and allied branches — usually entered through TNEA counselling after PCM in Class 12."],
  ["computer-applications-it", "Computer Applications & IT (BCA/B.Sc)",
    "Undergraduate computing degrees such as BCA and B.Sc Computer Science/IT, focused on software development and applications rather than core engineering."],
  ["medicine-allied-health", "Medicine & Allied Health Sciences",
    "MBBS, BDS, Nursing, Pharmacy, Physiotherapy and other health-science degrees, usually entered through NEET after PCB in Class 12."],
  ["pure-applied-sciences", "Pure & Applied Sciences (B.Sc)",
    "B.Sc degrees in Physics, Chemistry, Mathematics, Botany, Zoology and related subjects — a foundation for research, teaching or further specialisation."],
  ["agriculture-allied-sciences", "Agriculture & Allied Sciences",
    "B.Sc Agriculture, Horticulture, Forestry and Fisheries Science degrees, usually entered through TNAU/TNJFU counselling."],
  ["commerce-accounting", "Commerce & Accounting (B.Com)",
    "B.Com and related accounting/finance degrees, usually entered after the Commerce stream in Class 12."],
  ["business-administration", "Business Administration & Management (BBA)",
    "BBA and other management-focused undergraduate degrees, building toward business, operations and management roles."],
  ["law", "Law (BA LLB / BBA LLB)",
    "Integrated 5-year law degrees taken directly after Class 12, usually entered through CLAT or a college's own law entrance test."],
  ["arts-humanities-social-sciences", "Arts, Humanities & Social Sciences (BA)",
    "BA degrees in History, Economics, Political Science, Literature and other humanities and social-science subjects."],
  ["design-creative-arts", "Design & Creative Arts",
    "Visual Communication, Fashion Design, Fine Arts and other creative-arts undergraduate degrees."],
  ["education-teacher-training", "Education & Teacher Training",
    "Elementary Education and other teacher-training undergraduate routes, building toward a teaching career."],
  ["hotel-management-hospitality", "Hotel Management & Hospitality",
    "Hotel Management and Catering Technology degrees, building toward hospitality, tourism and guest-service careers."],
  ["architecture-planning", "Architecture & Planning (B.Arch)",
    "The 5-year B.Arch degree, usually entered through NATA after PCM in Class 12."],
  ["veterinary-animal-sciences", "Veterinary & Animal Sciences",
    "B.V.Sc & AH and related animal-science degrees, usually entered through ICAR/state counselling after PCB in Class 12."],
  ["physical-education-sports-sciences", "Physical Education & Sports Sciences",
    "B.P.Ed and related sports-science undergraduate degrees."],
];

const EXPLORER_IDS = [
  "20dd73ed-70cd-4e63-b559-5937372ac981", "afb994ba-9372-4479-bf70-1d1b922e58bb",
  "0d239200-1f9c-45da-934a-9d0ff507bdad", "c31a2c7b-249f-4215-b01d-637870920de8",
  "8c801997-b683-481c-abd0-34521355ada3", "d5ec426f-d646-443b-9ac2-e3ff8cb0018d",
  "f1f6dc86-72b0-4820-b0fc-cf45d4b343a4", "8378772d-89f1-4f84-b9e2-af5f9adfae53",
  "bb545975-ed9b-43b5-a867-792347c6f920", "4f51248f-c700-4ba6-bce4-2a204e81369a",
  "bb7ad97d-7fd2-4b47-852e-91177173718e", "37581117-9bcb-4e26-8628-3d6150a3403a",
];

const GENERAL_IDS = [
  "22472a48-86f0-45d7-aebf-021f42eeea6c", "2a645a13-3c55-4ee6-ae85-0dcd7726d499",
  "43b81932-329f-4b85-92e7-c8fe1f8629d3", "b3909c0b-f5c2-4297-ac58-2e99937c901d",
  "fcdbab4b-ce09-4521-b684-f99d4eeaec47", "1da28d9a-90e5-4f2f-a938-60d2f574427e",
  "455f819e-956b-454f-9d41-e11fabfd2e73", "46529113-2d94-4825-9d4e-87713fedeaf2",
  "3bc43aef-f570-4f89-8436-4bb51b9264ba", "8991af90-a4f3-47a8-9cfc-443d6cafdfaa",
  "209401af-9a2b-4556-9f8e-b24f9d5a533b", "447cc886-ed5a-4e40-99bf-32a84e59dbf8",
  "cba388ad-12b8-4773-874b-0efc13badb9b", "0e11852f-bbaa-4883-b85e-a40de7064d50",
  "2e8e6ccc-edca-4777-9255-9d7fc9ec3204",
];

const streamOptions = [
  ...EXPLORER_OPTIONS.map(([streamCode, title, description], index) => ({
    id: EXPLORER_IDS[index], streamCode, title, description, status: "active",
  })),
  ...GENERAL_OPTIONS.map(([streamCode, title, description], index) => ({
    id: GENERAL_IDS[index], streamCode, title, description, status: "active",
  })),
];

const byCode = new Map(streamOptions.map((option) => [option.streamCode, option.id]));

// ---------------------------------------------------------------- RIASEC pair -> ranked streams
// Every one of the 15 canonical top-two RIASEC pairs (R,I,A,S,E,C tie order) gets 3 ranked
// options per segment vocabulary — richer than the previous 2-per-pair MVP set, and now
// distinguishes what a post-10th student picks (explorer) from what a post-12th/graduate
// student picks (general, serving pathfinder + launcher).
const EXPLORER_RANKING = {
  RI: ["school-science-pcm", "vocational-electrical", "vocational-agriculture"],
  RA: ["vocational-electrical", "school-fine-arts", "school-science-pcm"],
  RS: ["vocational-healthcare", "school-physical-education", "vocational-agriculture"],
  RE: ["vocational-agriculture", "vocational-electrical", "school-commerce"],
  RC: ["vocational-it", "school-science-cs", "vocational-electrical"],
  IA: ["school-fine-arts", "school-humanities", "school-science-pcb"],
  IS: ["school-science-pcb", "vocational-healthcare", "school-humanities"],
  IE: ["school-commerce-maths", "school-science-cs", "school-commerce"],
  IC: ["school-science-cs", "school-commerce-maths", "school-science-pcm"],
  AS: ["school-humanities", "school-fine-arts", "school-physical-education"],
  AE: ["school-fine-arts", "school-humanities", "school-commerce"],
  AC: ["school-fine-arts", "school-commerce-maths", "school-humanities"],
  SE: ["school-physical-education", "school-humanities", "school-commerce"],
  SC: ["school-humanities", "school-commerce", "vocational-healthcare"],
  EC: ["school-commerce", "school-commerce-maths", "vocational-it"],
};

const GENERAL_RANKING = {
  RI: ["engineering-technology", "agriculture-allied-sciences", "veterinary-animal-sciences"],
  RA: ["architecture-planning", "engineering-technology", "design-creative-arts"],
  RS: ["physical-education-sports-sciences", "veterinary-animal-sciences", "agriculture-allied-sciences"],
  RE: ["agriculture-allied-sciences", "hotel-management-hospitality", "business-administration"],
  RC: ["engineering-technology", "computer-applications-it", "agriculture-allied-sciences"],
  IA: ["architecture-planning", "design-creative-arts", "pure-applied-sciences"],
  IS: ["medicine-allied-health", "pure-applied-sciences", "education-teacher-training"],
  IE: ["business-administration", "computer-applications-it", "engineering-technology"],
  IC: ["computer-applications-it", "pure-applied-sciences", "commerce-accounting"],
  AS: ["arts-humanities-social-sciences", "design-creative-arts", "education-teacher-training"],
  AE: ["design-creative-arts", "arts-humanities-social-sciences", "business-administration"],
  AC: ["design-creative-arts", "commerce-accounting", "arts-humanities-social-sciences"],
  SE: ["law", "hotel-management-hospitality", "business-administration"],
  SC: ["education-teacher-training", "arts-humanities-social-sciences", "commerce-accounting"],
  EC: ["business-administration", "commerce-accounting", "law"],
};

const EXPLORER_MAP_IDS = {
  RI: "c984f427-8acb-462d-bc98-d8361bb962b4", RA: "540d8aea-6063-49b2-a7e0-4e401f50fab8",
  RS: "17de7953-c92a-40a5-9ee2-822e9fe29bbb", RE: "413aad15-eb2c-4f85-90e6-3def2cdec0d4",
  RC: "f885ce34-3447-4a8e-8b1d-2e9048f9d331", IA: "6802caab-0d61-4c4a-927f-178cf73c1b74",
  IS: "5d40f92b-cca0-4389-9de5-f53b19a2e6d8", IE: "9b32bb44-a638-4216-af59-e1670bb6b76c",
  IC: "22487bab-b8a4-4f3c-81d8-9814c85e42e4", AS: "1446a724-eac8-4d4d-8619-8c8ba5a6917e",
  AE: "f1314bd7-1e21-423b-ac2d-981ea96ca1e0", AC: "541fe013-2bfe-402d-9c81-289400eee0d4",
  SE: "61f8b2e5-6d53-49f5-ae07-f63dede5c3b5", SC: "5c9fc2e0-ba8b-409d-bb62-62ae7c1b0c93",
  EC: "593f7967-9e4b-473e-a1f7-1faf9238f17e",
};

const GENERAL_MAP_IDS = {
  RI: "7030e90d-43a5-44ea-8e9d-824d49d99bc9", RA: "798980c0-f3d1-4db2-ba65-ccb656f240cd",
  RS: "8bd3a541-754d-4856-b8c4-e05a8ef91118", RE: "f41cc42b-253e-47cb-a82d-04f7aef2af65",
  RC: "55e8d656-8834-4ad1-bb5f-4ec27b441c9d", IA: "09e0d604-7b72-471b-9c57-ebeaaf01189f",
  IS: "e63e4271-3784-4201-96f6-56c74d32dc12", IE: "158dd746-88e4-438c-b5c8-45c1974348e2",
  IC: "703981be-3376-4805-bba5-54e1f3c88a50", AS: "2b71f8e5-dfaf-47bf-b8ac-c67c3b815905",
  AE: "8b119010-243c-4d37-a68c-1a102d6a64c6", AC: "8c80920f-0e16-4cc1-90d1-648f99c62b84",
  SE: "8e016985-8c73-4dc0-9c00-7ba70f300261", SC: "37731455-922b-4271-96ba-d3f30a03a217",
  EC: "402a5e8b-2496-4fb7-a2f5-24b3178e8bf6",
};

const PAIRS = ["RI", "RA", "RS", "RE", "RC", "IA", "IS", "IE", "IC", "AS", "AE", "AC", "SE", "SC", "EC"];

function buildMaps(mapIds, segment, version) {
  return PAIRS.map((pair) => ({
    id: mapIds[pair],
    topTwoCode: pair,
    segment,
    version,
    datasetVersionId: DATASET_VERSION_ID,
    status: "published",
  }));
}

function buildItems(mapIds, ranking, reasonPrefix) {
  const items = [];
  for (const pair of PAIRS) {
    ranking[pair].forEach((streamCode, index) => {
      const streamOptionId = byCode.get(streamCode);
      if (!streamOptionId) throw new Error(`Unknown stream code: ${streamCode}`);
      items.push({
        mapId: mapIds[pair],
        streamOptionId,
        rank: index + 1,
        reasonKey: `${reasonPrefix}_${pair.toLowerCase()}_${index + 1}`,
      });
    });
  }
  return items;
}

const streamMaps = [
  ...buildMaps(EXPLORER_MAP_IDS, "explorer", "2026-09-18-explorer"),
  ...buildMaps(GENERAL_MAP_IDS, null, "2026-09-18-general"),
];

const streamMapItems = [
  ...buildItems(EXPLORER_MAP_IDS, EXPLORER_RANKING, "post10"),
  ...buildItems(GENERAL_MAP_IDS, GENERAL_RANKING, "post12"),
];

const records = {
  educationRoutes: [],
  pathways: [],
  careerPathways: [],
  streamOptions,
  streamMaps,
  streamMapItems,
};

const recordsText = JSON.stringify(records, null, 2) + "\n";
const checksumSha256 = createHash("sha256").update(recordsText).digest("hex");

const manifest = {
  schemaVersion: 1,
  datasetKey: "tn-stream-catalogue",
  version: "2026-09-18",
  datasetVersionId: DATASET_VERSION_ID,
  recordsFile: "records.json",
  recordCounts: {
    educationRoutes: 0,
    pathways: 0,
    careerPathways: 0,
    streamOptions: streamOptions.length,
    streamMaps: streamMaps.length,
    streamMapItems: streamMapItems.length,
  },
  checksumSha256,
  reviewStatus: "approved",
  createdAt: "2026-09-18T00:00:00.000Z",
  source: {
    id: SOURCE_ID,
    sourceKey: "yuvapath-curated-stream-catalogue",
    name: "YuvaPath curated stream catalogue (post-10th school streams + post-12th UG discipline families)",
    sourceType: "manual_review",
    publisher: "YuvaPath",
    trustLevel: "internal_reviewed",
    status: "active",
    baseUrl: null,
    licenseRef: "Internal curated content — standard Tamil Nadu/Indian school and UG stream categories, human-authored and reviewed, not sourced from an external dataset.",
  },
};

const outDir = resolve(OUT_DIR);
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "records.json"), recordsText, "utf8");
await writeFile(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n", "utf8");

process.stdout.write(`Wrote ${outDir}\n`);
process.stdout.write(`  streamOptions=${streamOptions.length} streamMaps=${streamMaps.length} streamMapItems=${streamMapItems.length}\n`);
process.stdout.write(`  checksumSha256=${checksumSha256}\n`);
