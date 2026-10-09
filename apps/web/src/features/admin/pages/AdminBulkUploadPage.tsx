import { useMemo, useState } from "react";
import { Check, Upload } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AdminBulkCategory, AdminBulkValidateResponse } from "@yuvapath/contracts";
import { cn } from "@/lib/utils";
import { AdminButton, Field, SelectInput, adminErrorMessage, useAdminToast } from "../components/admin-ui";
import { AdminLayout } from "../components/AdminLayout";
import { DetailShell, FormCard, FormError } from "../components/detail-shell";
import { usePublishBulk, useValidateBulk } from "../hooks/useAdminCatalog";

type TargetField = { key: string; label: string; required?: boolean };

const TARGETS: Record<AdminBulkCategory, TargetField[]> = {
  colleges: [
    { key: "name", label: "Name", required: true },
    { key: "city", label: "City", required: true },
    { key: "institutionType", label: "Institution type" },
    { key: "tier", label: "Tier" },
    { key: "admissionRoute", label: "Admission route" },
    { key: "feesBand", label: "Fees band" },
    { key: "websiteUrl", label: "Website" },
    { key: "verificationStatus", label: "Verification status" },
  ],
  aid: [
    { key: "name", label: "Name", required: true },
    { key: "provider", label: "Provider", required: true },
    { key: "level", label: "Level", required: true },
    { key: "applicationUrl", label: "Application URL", required: true },
    { key: "aidKind", label: "Type (aid / scholarship)" },
    { key: "providerType", label: "Provider type" },
    { key: "amountText", label: "Amount" },
    { key: "portalName", label: "Portal name" },
    { key: "verificationStatus", label: "Verification status" },
  ],
};

const SAMPLE_CSV: Record<AdminBulkCategory, string> = {
  colleges: [
    "name,city,institutionType,tier,verificationStatus,websiteUrl",
    "Sri Ramakrishna Engineering College,Coimbatore,Engineering College - Self-Financing,2,unverified,https://srec.ac.in",
    "Government Polytechnic College Salem,Salem,Polytechnic College - Government,3,unverified,",
  ].join("\n"),
  aid: [
    "name,provider,level,applicationUrl,aidKind,amountText",
    "Sample State Merit Scholarship,Govt of Tamil Nadu,UG Degree,https://scholarships.gov.in,scholarship,Rs 10000 / year",
    "Sample Education Loan Subsidy,Sample Bank,Post-matriculation,https://example.org/apply,aid,Interest subsidy",
  ].join("\n"),
};

const STEPS = ["Choose file", "Map columns", "Review duplicates", "Publish"] as const;

/** Minimal RFC-4180-style CSV parser: quoted fields, escaped quotes and embedded commas/newlines. */
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  const headers = (nonEmpty[0] ?? []).map((header) => header.trim());
  const rows = nonEmpty.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()])),
  );
  return { headers, rows };
}

const guessColumn = (headers: string[], key: string): string =>
  headers.find((header) => header.replace(/[\s_-]/g, "").toLowerCase() === key.toLowerCase()) ?? "";

/** Four-step staged import: choose a CSV, map its columns, review duplicates, publish. */
function BulkUploadContent() {
  const navigate = useNavigate();
  const toast = useAdminToast();
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState<AdminBulkCategory>(
    searchParams.get("category") === "aid" ? "aid" : "colleges",
  );
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<AdminBulkValidateResponse["rows"]>([]);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  // Fixed for this upload session, so a retried "Publish" replays rather than importing twice.
  const [publishKey] = useState(() => crypto.randomUUID());
  const validate = useValidateBulk();
  const publish = usePublishBulk();
  const targets = TARGETS[category];

  const mappedRows = useMemo(
    () =>
      rows.map((row) =>
        Object.fromEntries(
          targets.map((target) => [target.key, mapping[target.key] ? (row[mapping[target.key]!] ?? "") : ""]),
        ),
      ),
    [rows, mapping, targets],
  );

  const load = (text: string, name: string) => {
    const parsed = parseCsv(text);
    setFileName(name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(Object.fromEntries(targets.map((target) => [target.key, guessColumn(parsed.headers, target.key)])));
    setError(parsed.rows.length === 0 ? "That file has no data rows." : null);
  };

  const changeCategory = (next: AdminBulkCategory) => {
    setCategory(next);
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setError(null);
  };

  const missingRequired = targets.filter((target) => target.required && !mapping[target.key]);

  const toReview = async () => {
    setError(null);
    try {
      const result = await validate.mutateAsync({ category, rows: mappedRows });
      setValidation(result.rows);
      setIncluded(Object.fromEntries(result.rows.map((row) => [row.index, row.errors.length === 0 && !row.duplicate])));
      setStep(3);
    } catch (caught) {
      setError(adminErrorMessage(caught, "We couldn't check this file. Please try again."));
    }
  };

  const selected = validation.filter((row) => included[row.index]);
  const duplicates = validation.filter((row) => row.duplicate).length;
  const invalid = validation.filter((row) => row.errors.length > 0).length;

  const doPublish = async () => {
    setError(null);
    try {
      const result = await publish.mutateAsync({
        request: { category, rows: selected.map((row) => mappedRows[row.index]!) },
        key: publishKey,
      });
      toast(`Published ${result.published} record(s).`);
      void navigate(category === "colleges" ? "/admin/colleges" : "/admin/aid-schemes");
    } catch (caught) {
      setError(adminErrorMessage(caught, "We couldn't publish these records. Please try again."));
    }
  };

  return (
    <DetailShell
      backTo={category === "colleges" ? "/admin/colleges" : "/admin/aid-schemes"}
      backLabel={category === "colleges" ? "Back to colleges" : "Back to aid schemes"}
      title="Bulk upload"
      subtitle="Stage a batch of records, check them against what already exists, then publish."
    >
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Progress">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const active = number === step;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-2 text-sm",
                active && "border-[#5829c7] bg-[#f0eaff] font-semibold text-[#5829c7]",
                done && "border-[#e5edf5] bg-white text-[#12B76A]",
                !active && !done && "border-[#e5edf5] bg-white text-[#7c8295]",
              )}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-xs font-bold",
                  active ? "bg-[#5829c7] text-white" : done ? "bg-[#12B76A] text-white" : "bg-[#e5edf5] text-[#6b7280]",
                )}
              >
                {done ? <Check className="size-3" aria-hidden="true" /> : number}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <FormCard>
        {step === 1 ? (
          <>
            <Field label="Category" htmlFor="bulk-category" className="max-w-xs">
              <SelectInput
                id="bulk-category"
                value={category}
                onChange={(event) => changeCategory(event.target.value as AdminBulkCategory)}
              >
                <option value="colleges">Colleges</option>
                <option value="aid">Aid schemes and scholarships</option>
              </SelectInput>
            </Field>
            <label
              htmlFor="bulk-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#e5edf5] bg-[#fbfaff] px-5 py-10 text-center text-[#6b7280]"
            >
              <Upload className="size-7 text-[#7c8295]" aria-hidden="true" />
              <span className="font-medium text-[#1e1b4b]">Choose a CSV file</span>
              <span className="text-sm">
                Records are added to your region. Every row is checked against what already exists.
              </span>
              <input
                id="bulk-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file.text().then((text) => load(text, file.name));
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <AdminButton className="h-10 text-sm" onClick={() => load(SAMPLE_CSV[category], `sample-${category}.csv`)}>
                Use sample file instead
              </AdminButton>
              <span className="text-sm text-[#7c8295]">
                {fileName ? `${rows.length} row(s) read from ${fileName}.` : "No file loaded yet."}
              </span>
            </div>
            <FormError message={error} />
            <div className="flex justify-end pt-4">
              <AdminButton variant="solid" disabled={rows.length === 0} onClick={() => setStep(2)}>
                Continue
              </AdminButton>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="text-sm text-[#6b7280]">We matched columns by name — check them before continuing.</p>
            <div className="flex flex-col gap-3">
              {targets.map((target) => (
                <div key={target.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2 sm:gap-4">
                  <label htmlFor={`map-${target.key}`} className="text-sm font-medium text-[#1e1b4b]">
                    {target.label}
                    {target.required ? <span className="text-[#db3030]"> *</span> : null}
                  </label>
                  <SelectInput
                    id={`map-${target.key}`}
                    value={mapping[target.key] ?? ""}
                    onChange={(event) => setMapping((current) => ({ ...current, [target.key]: event.target.value }))}
                  >
                    <option value="">{target.required ? "Choose a column" : "Not in this file"}</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              ))}
            </div>
            <FormError message={error} />
            <div className="flex justify-between gap-4 pt-4">
              <AdminButton onClick={() => setStep(1)}>Back</AdminButton>
              <AdminButton
                variant="solid"
                disabled={missingRequired.length > 0 || validate.isPending}
                onClick={() => void toReview()}
              >
                {validate.isPending ? "Checking…" : "Continue"}
              </AdminButton>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="text-sm text-[#6b7280]">
              {validation.length} rows read · {validation.length - duplicates - invalid} new · {duplicates} look like
              duplicates (matched by name) · {invalid} invalid
            </p>
            <div className="overflow-x-auto rounded-xl border border-[#e5edf5]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[#f0eaff] text-[#1e1b4b]">
                  <tr>
                    <th className="px-4 py-3 font-normal">Include</th>
                    <th className="px-4 py-3 font-normal">Name</th>
                    <th className="px-4 py-3 font-normal">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.map((row) => (
                    <tr key={row.index} className="border-t border-[#e5edf5]">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Include ${row.name || "row " + (row.index + 1)}`}
                          checked={Boolean(included[row.index])}
                          disabled={row.errors.length > 0}
                          onChange={(event) =>
                            setIncluded((current) => ({ ...current, [row.index]: event.target.checked }))
                          }
                          className="size-4 accent-[#5829c7]"
                        />
                      </td>
                      <td className="px-4 py-3 text-[#1e1b4b]">{row.name || "(blank)"}</td>
                      <td className="px-4 py-3">
                        {row.errors.length > 0 ? (
                          <span className="text-[#db3030]">{row.errors.join("; ")}</span>
                        ) : row.duplicate ? (
                          <span className="text-[#b54708]">Looks like a duplicate</span>
                        ) : (
                          <span className="text-[#12B76A]">New record</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-4 pt-4">
              <AdminButton onClick={() => setStep(2)}>Back</AdminButton>
              <AdminButton variant="solid" onClick={() => setStep(4)}>
                Continue to publish
              </AdminButton>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <p className="text-sm text-[#6b7280]">
              {selected.length} record(s) will be added to {category === "colleges" ? "Colleges" : "Aid schemes"}.
            </p>
            <ul className="max-h-60 list-disc overflow-y-auto rounded-lg bg-[#fbfaff] py-3 pr-4 pl-8 text-sm text-[#1e1b4b]">
              {selected.length > 0 ? (
                selected.map((row) => <li key={row.index}>{row.name}</li>)
              ) : (
                <li className="list-none">Nothing selected — go back and include at least one row.</li>
              )}
            </ul>
            <FormError message={error} />
            <div className="flex justify-between gap-4 pt-4">
              <AdminButton onClick={() => setStep(3)}>Back</AdminButton>
              <AdminButton
                variant="solid"
                disabled={selected.length === 0 || publish.isPending}
                onClick={() => void doPublish()}
              >
                {publish.isPending ? "Publishing…" : `Publish ${selected.length} record(s)`}
              </AdminButton>
            </div>
          </>
        ) : null}
      </FormCard>
    </DetailShell>
  );
}

export function AdminBulkUploadPage() {
  return (
    <AdminLayout>
      <BulkUploadContent />
    </AdminLayout>
  );
}
