import { useId, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AdminCollegeInputSchema,
  type AdminCollegeDetail,
  type VerificationStatus,
} from "@yuvapath/contracts";
import {
  AdminButton,
  Field,
  Modal,
  SelectInput,
  StatusSelectInput,
  TextInput,
  adminErrorMessage,
  useAdminToast,
} from "./admin-ui";
import { FieldGrid, FormActions, FormCard, FormError, fieldErrors, formatVerifiedDate } from "./detail-shell";

const INSTITUTION_TYPE_SUGGESTIONS = [
  "Arts & Science College - Government",
  "Engineering College - Self-Financing",
  "Polytechnic College - Government",
  "University",
  "College",
];
const ADMISSION_ROUTE_SUGGESTIONS = ["TNEA Counselling", "TNPCEE Counselling", "JoSAA / JEE Counselling", "Direct admission"];

type FormState = {
  name: string;
  city: string;
  state: string;
  institutionType: string;
  tier: string;
  admissionRoute: string;
  feesBand: string;
  websiteUrl: string;
  verificationStatus: VerificationStatus;
};

const toFormState = (college: AdminCollegeDetail | undefined, defaultState: string): FormState => ({
  name: college?.name ?? "",
  city: college?.city ?? "",
  state: college?.state ?? defaultState,
  institutionType: college?.institutionType ?? "College",
  tier: college?.tier ? String(college.tier) : "",
  admissionRoute: college?.admissionRoute ?? "",
  feesBand: college?.feesBand ?? "",
  websiteUrl: college?.websiteUrl ?? "",
  verificationStatus: college?.verificationStatus ?? "unverified",
});

const FIELD_MESSAGES: Record<string, string> = {
  websiteUrl: "Enter a full website address starting with https://",
  tier: "Choose Tier 1, 2 or 3.",
};

export type CollegeFormProps = {
  /** Undefined = creating a new college. */
  college?: AdminCollegeDetail;
  defaultState: string;
  saving: boolean;
  deleting: boolean;
  onSave: (input: ReturnType<typeof AdminCollegeInputSchema.parse>) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Figma "college-details-form" (node 996:4205): five rows of two fields, then Delete / Save. */
export function CollegeForm({ college, defaultState, saving, deleting, onSave, onDelete }: CollegeFormProps) {
  const [values, setValues] = useState<FormState>(() => toFormState(college, defaultState));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const toast = useAdminToast();
  const ids = useId();
  const idFor = (name: string) => `${ids}-${name}`;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = async () => {
    const parsed = AdminCollegeInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, FIELD_MESSAGES));
      setSubmitError("Please fix the highlighted fields.");
      return;
    }
    setSubmitError(null);
    try {
      await onSave(parsed.data);
    } catch (error) {
      const message = adminErrorMessage(error, "We couldn't save this college. Please try again.");
      setSubmitError(message);
      toast(message, "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await onDelete?.();
    } catch (error) {
      setConfirmingDelete(false);
      const message = adminErrorMessage(error, "We couldn't delete this college. Please try again.");
      setSubmitError(message);
      toast(message, "error");
    }
  };

  return (
    <>
      <FormCard onSubmit={() => void submit()}>
        <div className="flex flex-col gap-4">
          <FieldGrid>
            <Field label="Name" required htmlFor={idFor("name")} error={errors.name}>
              <TextInput
                id={idFor("name")}
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Government Arts College"
              />
            </Field>
            <Field label="City" required htmlFor={idFor("city")} error={errors.city}>
              <TextInput
                id={idFor("city")}
                value={values.city}
                onChange={(event) => set("city", event.target.value)}
                placeholder="Chennai"
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="State" required htmlFor={idFor("state")} error={errors.state}>
              <TextInput
                id={idFor("state")}
                value={values.state}
                onChange={(event) => set("state", event.target.value)}
              />
            </Field>
            <Field label="Institution Type" required htmlFor={idFor("type")} error={errors.institutionType}>
              <TextInput
                id={idFor("type")}
                list={idFor("type-options")}
                value={values.institutionType}
                onChange={(event) => set("institutionType", event.target.value)}
              />
              <datalist id={idFor("type-options")}>
                {INSTITUTION_TYPE_SUGGESTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Tier" htmlFor={idFor("tier")} error={errors.tier}>
              <SelectInput
                id={idFor("tier")}
                value={values.tier}
                onChange={(event) => set("tier", event.target.value)}
              >
                <option value="">Not set</option>
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
              </SelectInput>
            </Field>
            <Field label="Admission Route" htmlFor={idFor("route")} error={errors.admissionRoute}>
              <TextInput
                id={idFor("route")}
                list={idFor("route-options")}
                value={values.admissionRoute}
                onChange={(event) => set("admissionRoute", event.target.value)}
                placeholder="TNEA Counselling"
              />
              <datalist id={idFor("route-options")}>
                {ADMISSION_ROUTE_SUGGESTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Fees Band" htmlFor={idFor("fees")} error={errors.feesBand}>
              <TextInput
                id={idFor("fees")}
                value={values.feesBand}
                onChange={(event) => set("feesBand", event.target.value)}
                placeholder="₹10k–18k / yr"
              />
            </Field>
            <Field label="Website" htmlFor={idFor("website")} error={errors.websiteUrl}>
              <TextInput
                id={idFor("website")}
                type="url"
                value={values.websiteUrl}
                onChange={(event) => set("websiteUrl", event.target.value)}
                placeholder="https://www.gac.ac.in"
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Verification Status" required htmlFor={idFor("status")} error={errors.verificationStatus}>
              <StatusSelectInput
                id={idFor("status")}
                value={values.verificationStatus}
                onChange={(value) => set("verificationStatus", value)}
              />
            </Field>
            <Field label="Last Verified" htmlFor={idFor("verified")}>
              <TextInput id={idFor("verified")} value={formatVerifiedDate(college?.lastVerifiedAt ?? null)} disabled readOnly />
            </Field>
          </FieldGrid>
        </div>

        <FormError message={submitError} />

        <FormActions>
          {onDelete ? (
            <AdminButton className="w-[118px]" disabled={saving || deleting} onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </AdminButton>
          ) : null}
          <button
            type="submit"
            disabled={saving || deleting}
            className="inline-flex h-12 w-[158px] cursor-pointer items-center justify-center rounded-[9px] bg-[#5829c7] px-4 text-base font-medium text-white transition-colors hover:bg-[#4a21a8] focus-visible:ring-2 focus-visible:ring-[#5829c7]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : college ? "Save Changes" : "Add College"}
          </button>
        </FormActions>
      </FormCard>

      {confirmingDelete && college ? (
        <Modal
          title={`Delete ${college.name}?`}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <AdminButton onClick={() => setConfirmingDelete(false)}>Cancel</AdminButton>
              <AdminButton variant="solid" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? "Deleting…" : "Delete college"}
              </AdminButton>
            </>
          }
        >
          <p>This also removes its program records. This cannot be undone.</p>
          {college.programs.length > 0 ? (
            <ul className="mt-3 max-h-40 list-disc overflow-y-auto rounded-lg bg-[#fbfaff] py-2 pr-3 pl-7 text-[#1e1b4b]">
              {college.programs.map((program) => (
                <li key={program.id}>Program: {program.programName}</li>
              ))}
            </ul>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
