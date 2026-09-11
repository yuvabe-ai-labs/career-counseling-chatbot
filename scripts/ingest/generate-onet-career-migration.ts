import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Generates a migration from the FULL O*NET Interests dataset (all occupations with a
// complete RIASEC profile, not the 30-career curated subset the old version of this script
// produced). Source: "Career Interest Types.xlsx" — the standard O*NET Interests export
// (O*NET-SOC Code, Title, Element ID, Element Name, Scale ID, Scale Name, Data Value, Date,
// Domain Source). Read directly as XML rather than via an xlsx-parsing library, matching this
// repo's existing convention (generate-onet-career-values.ts hand-parses a raw tab-delimited
// file) of no parsing dependency for one-off ingest scripts.
//
// The two XML parts below are the xlsx's own internal sheet + shared-string table, extracted
// once with (re-run if the source .xlsx changes):
//   cd data/raw/onet/interests-full
//   unzip -o -p "Career Interest Types.xlsx" xl/worksheets/sheet1.xml > sheet1.xml
//   unzip -o -p "Career Interest Types.xlsx" xl/sharedStrings.xml > sharedStrings.xml

const rawDir = resolve("data/raw/onet/interests-full");

// ---------------------------------------------------------------------------
// Minimal XML parsing — this file's shape is a flat single sheet, no rich text.
// ---------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? match;
  });
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const siMatch of xml.matchAll(/<si>(.*?)<\/si>/gs)) {
    const text = [...siMatch[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)]
      .map((textMatch) => unescapeXml(textMatch[1]))
      .join("");
    strings.push(text);
  }
  return strings;
}

type SheetRow = Record<string, string>;

function parseSheetRows(xml: string, sharedStrings: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const rowMatch of xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    if (Number(rowMatch[1]) === 1) continue; // header row
    const row: SheetRow = {};
    for (const cellMatch of rowMatch[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)<\/v>)?<\/c>/gs)) {
      const [, column, attrs, rawValue] = cellMatch;
      if (rawValue === undefined) continue;
      const isSharedString = /\bt="s"/.test(attrs);
      row[column] = isSharedString ? (sharedStrings[Number(rawValue)] ?? "") : rawValue;
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Load + group into one RIASEC profile per occupation
// ---------------------------------------------------------------------------

const sharedStringsXml = await readFile(resolve(rawDir, "sharedStrings.xml"), "utf8");
const sheetXml = await readFile(resolve(rawDir, "sheet1.xml"), "utf8");
const sharedStrings = parseSharedStrings(sharedStringsXml);
const rows = parseSheetRows(sheetXml, sharedStrings);

const INTEREST_NAMES = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"];

type Occupation = { code: string; title: string; values: (number | undefined)[] };

const occupationsByCode = new Map<string, Occupation>();
for (const row of rows) {
  const onetCode = row.A;
  const scaleId = row.E;
  const elementName = row.D;
  if (!onetCode || scaleId !== "OI") continue;
  const letterIndex = INTEREST_NAMES.indexOf(elementName ?? "");
  if (letterIndex === -1) continue;

  let occupation = occupationsByCode.get(onetCode);
  if (!occupation) {
    occupation = { code: onetCode, title: row.B ?? onetCode, values: new Array(6).fill(undefined) };
    occupationsByCode.set(onetCode, occupation);
  }
  occupation.values[letterIndex] = Number(row.G);
}

const skippedCodes: string[] = [];
const occupations = [...occupationsByCode.values()].filter((occupation) => {
  const complete = occupation.values.every((value) => typeof value === "number" && !Number.isNaN(value));
  if (!complete) skippedCodes.push(occupation.code);
  return complete;
});

if (skippedCodes.length > 0) {
  console.warn(
    `Skipping ${skippedCodes.length} occupation(s) with an incomplete RIASEC profile:`,
    skippedCodes.slice(0, 10),
    skippedCodes.length > 10 ? `... (+${skippedCodes.length - 10} more)` : "",
  );
}

// ---------------------------------------------------------------------------
// domain_code — no source column for this in O*NET's Interests file (and it has zero effect
// on matching/recommendations — not selected anywhere in recommendation-data-source.ts's
// loadCareers() query — this is descriptive metadata only), so it's derived mechanically from
// each occupation's SOC major group, extending the 16 domain buckets the original 30-career
// curated set already used.
// ---------------------------------------------------------------------------

const DOMAIN_BY_MAJOR_GROUP: Record<string, string> = {
  "11": "business-finance",
  "13": "business-finance",
  "15": "technology",
  "17": "engineering",
  "19": "science-research",
  "21": "social-community",
  "23": "law-public-service",
  "25": "education",
  "27": "arts-media-design",
  "29": "healthcare",
  "31": "healthcare",
  "33": "law-public-service",
  "35": "hospitality-tourism",
  "37": "skilled-trades",
  "39": "hospitality-tourism",
  "41": "business-finance",
  "43": "business-finance",
  "45": "agriculture-environment",
  "47": "skilled-trades",
  "49": "skilled-trades",
  "51": "skilled-trades",
  "53": "transport-automotive",
  "55": "law-public-service",
};

function domainCodeFor(onetCode: string): string {
  if (onetCode.startsWith("17-1")) return "architecture-construction"; // Architects, not engineers
  if (onetCode.startsWith("49-3")) return "transport-automotive"; // Vehicle/mobile equipment mechanics
  return DOMAIN_BY_MAJOR_GROUP[onetCode.slice(0, 2)] ?? "business-finance";
}

// ---------------------------------------------------------------------------
// Emit SQL — same upsert-safe shape the original 30-career migration used.
// ---------------------------------------------------------------------------

const quote = (value: string | null) => (value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`);
const slug = (title: string) =>
  title
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const uuidFor = (index: number) => `f0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const careerRows: string[] = [];
const profileRows: string[] = [];
for (const [index, occupation] of occupations.entries()) {
  const domainCode = domainCodeFor(occupation.code);
  careerRows.push(
    `(${quote(uuidFor(index + 1))}::uuid, ${quote(occupation.code)}, NULL, ${quote(slug(occupation.title))}, ${quote(occupation.title)}, NULL, ${quote(domainCode)})`,
  );
  const normalized = occupation.values.map((value) => (Number(value) / 7).toFixed(5));
  profileRows.push(`(${quote(occupation.code)}, ${normalized.join(", ")})`);
}

const checksum = createHash("sha256").update(sharedStringsXml).update(sheetXml).digest("hex");
const datasetVersion = "30.4-full-2026-09";

const sql = `-- Generated from the full O*NET 30.4 Interests dataset ("Career Interest Types.xlsx"):
-- ${occupations.length} occupations with a complete RIASEC profile (${skippedCodes.length} skipped
-- as incomplete) out of ${occupationsByCode.size} occupations found in the source file.
-- Supersedes the 30-career curated subset from 20260805000400_onet_30_4_career_domains.sql —
-- same upsert-safe pattern (ON CONFLICT on onet_code / career_id), so those 30 rows are
-- refreshed in place from the fuller file rather than duplicated; nothing is deleted.
-- RIASEC OI values normalized from O*NET's 1-7 scale to this schema's 0-1 scale (divide by 7)
-- — mathematically irrelevant to matching itself (scoreCareers() re-normalizes every vector at
-- query time; Pearson correlation is scale-invariant), kept only for column-convention
-- consistency with the existing data.
BEGIN;
INSERT INTO knowledge.knowledge_sources (id, source_key, name, source_type, base_url, publisher, license_ref, trust_level, status, created_at, updated_at)
VALUES ('e4000000-0000-4000-8000-999999999991', 'onet-30-4', 'O*NET 30.4 Database', 'official_download', 'https://www.onetcenter.org/database.html', 'U.S. Department of Labor, Employment and Training Administration', 'CC BY 4.0; attribution required', 'authoritative_external', 'active', now(), now())
ON CONFLICT (source_key) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at;
INSERT INTO knowledge.dataset_versions (id, source_id, dataset_key, version, checksum, record_count, import_status, validation_report_json, imported_at, published_at, created_by)
VALUES ('f0000000-0000-4000-8000-999999999992', 'e4000000-0000-4000-8000-999999999991', 'onet-careers', ${quote(datasetVersion)}, '${checksum}', ${occupations.length}, 'published', '{"status":"validated","normalization":"OI divided by 7","source":"Career Interest Types.xlsx (full O*NET 30.4 Interests export)"}'::jsonb, now(), now(), NULL)
ON CONFLICT (dataset_key, version) DO UPDATE SET checksum=excluded.checksum, record_count=excluded.record_count, validation_report_json=excluded.validation_report_json;
WITH source_data(id, onet_code, nco_code, slug, title, description, domain_code) AS (VALUES
  ${careerRows.join(",\n  ")}
)
INSERT INTO knowledge.careers (id, onet_code, nco_code, slug, title, short_description, domain_code, primary_education_route_id, is_curated, publication_status, dataset_version_id, published_at, retired_at, created_at, updated_at)
SELECT id, onet_code, nco_code, slug, title, description, domain_code, NULL, false, 'published', 'f0000000-0000-4000-8000-999999999992', now(), NULL, now(), now() FROM source_data
ON CONFLICT (onet_code) DO UPDATE SET nco_code=excluded.nco_code, title=excluded.title, short_description=excluded.short_description, domain_code=excluded.domain_code, dataset_version_id=excluded.dataset_version_id, publication_status='published', updated_at=excluded.updated_at;
WITH profile_data(onet_code, realistic, investigative, artistic, social, enterprising, conventional) AS (VALUES
  ${profileRows.join(",\n  ")}
)
INSERT INTO knowledge.career_interest_profiles (career_id, realistic, investigative, artistic, social, enterprising, conventional, high_point_code, profile_version, dataset_version_id)
SELECT c.id, p.realistic, p.investigative, p.artistic, p.social, p.enterprising, p.conventional, NULL, 'onet-30.4-full-OI-normalized', 'f0000000-0000-4000-8000-999999999992'
FROM profile_data p JOIN knowledge.careers c ON c.onet_code = p.onet_code
ON CONFLICT (career_id) DO UPDATE SET realistic=excluded.realistic, investigative=excluded.investigative, artistic=excluded.artistic, social=excluded.social, enterprising=excluded.enterprising, conventional=excluded.conventional, profile_version=excluded.profile_version, dataset_version_id=excluded.dataset_version_id;
COMMIT;
`;

const output = resolve("supabase/migrations/20260910000100_onet_full_career_catalog.sql");
await writeFile(output, sql, "utf8");
console.log(
  `Generated ${output}: ${occupations.length} occupations across ${new Set(occupations.map((o) => domainCodeFor(o.code))).size} domains (${skippedCodes.length} skipped)`,
);
