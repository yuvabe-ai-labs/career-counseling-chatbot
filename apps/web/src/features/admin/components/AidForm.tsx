import { useId, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AdminAidSchemeInputSchema,
  type AdminAidScheme,
  type AidKind,
  type VerificationStatus,
} from "@yuvapath/contracts";
import { cn } from "@/lib/utils";
import {
  AdminButton,
  Field,
  Modal,
  SelectInput,
  StatusSelectInput,
  TextArea,
  TextInput,
  adminErrorMessage,
  useAdminToast,
} from "./admin-ui";
import { FieldGrid, FormActions, FormCard, FormError, fieldErrors, formatVerifiedDate } from "./detail-shell";

/** The states the prototype offered as chips; any other state already on a scheme is added too. */
const KNOWN_STATES = ["Tamil Nadu", "Karnataka", "Kerala", "Andhra Pradesh", "Telangana"];
const PROVIDER_TYPES = ["central", "state", "CSR", "institution", "meta"];

type FormState = {
  name: string;
  aidKind: AidKind;
  providerType: string;
  provider: string;
  level: string;
  states: string[];
  eligibilitySummary: string;
  benefitSummary: string;
  amountText: string;
  applicationUrl: string;
  portalName: string;
  verificationStatus: VerificationStatus;
};

const toFormState = (scheme: AdminAidScheme | undefined, kind: AidKind, defaultState: string): FormState => ({
  name: scheme?.name ?? "",
  aidKind: scheme?.aidKind ?? kind,
  providerType: scheme?.providerType ?? "",
  provider: scheme?.provider ?? "",
  level: scheme?.level ?? "",
  states: scheme ? [...scheme.states] : [defaultState],
  eligibilitySummary: scheme?.eligibilitySummary ?? "",
  benefitSummary: scheme?.benefitSummary ?? "",
  amountText: scheme?.amountText ?? "",
  applicationUrl: scheme?.applicationUrl ?? "",
  portalName: scheme?.portalName ?? "",
  verificationStatus: scheme?.verificationStatus ?? "unverified",
});

const FIELD_MESSAGES: Record<string, string> = {
  applicationUrl: "Enter a full application link starting with https://",
};

export type AidFormProps = {
  scheme?: AdminAidScheme;
  /** Which list the form was opened from; the default for a new record's kind. */
  kind: AidKind;
  /** The signed-in admin's state. */
  regionState: string;
  noun: string;
  saving: boolean;
  deleting: boolean;
  onSave: (input: ReturnType<typeof AdminAidSchemeInputSchema.parse>) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Aid scheme / scholarship edit form — the college form's card, rows and action row. */
export function AidForm({ scheme, kind, regionState, noun, saving, deleting, onSave, onDelete }: AidFormProps) {
  const [values, setValues] = useState<FormState>(() => toFormState(scheme, kind, regionState));
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

  const stateOptions = [...new Set([...KNOWN_STATES, ...values.states])];
  const toggleState = (state: string) =>
    set(
      "states",
      values.states.includes(state) ? values.states.filter((entry) => entry !== state) : [...values.states, state],
    );
  const leavesRegion =
    values.states.length > 0 && !values.states.some((state) => state.toLowerCase() === regionState.toLowerCase());

  const submit = async () => {
    const parsed = AdminAidSchemeInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, FIELD_MESSAGES));
      setSubmitError("Please fix the highlighted fields.");
      return;
    }
    setSubmitError(null);
    try {
      await onSave(parsed.data);
    } catch (error) {
      const message = adminErrorMessage(error, `We couldn't save this ${noun}. Please try again.`);
      setSubmitError(message);
      toast(message, "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await onDelete?.();
    } catch (error) {
      setConfirmingDelete(false);
      const message = adminErrorMessage(error, `We couldn't delete this ${noun}. Please try again.`);
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
              <TextInput id={idFor("name")} value={values.name} onChange={(event) => set("name", event.target.value)} />
            </Field>
            <Field label="Provider" required htmlFor={idFor("provider")} error={errors.provider}>
              <TextInput
                id={idFor("provider")}
                value={values.provider}
                onChange={(event) => set("provider", event.target.value)}
                placeholder="AICTE"
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Level" required htmlFor={idFor("level")} error={errors.level}>
              <TextInput
                id={idFor("level")}
                value={values.level}
                onChange={(event) => set("level", event.target.value)}
                placeholder="UG Degree"
              />
            </Field>
            <Field label="Provider Type" htmlFor={idFor("provider-type")} error={errors.providerType}>
              <SelectInput
                id={idFor("provider-type")}
                value={values.providerType}
                onChange={(event) => set("providerType", event.target.value)}
              >
                <option value="">Not set</option>
                {[...new Set([...PROVIDER_TYPES, ...(values.providerType ? [values.providerType] : [])])].map(
                  (type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ),
                )}
              </SelectInput>
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Application URL" required htmlFor={idFor("url")} error={errors.applicationUrl}>
              <TextInput
                id={idFor("url")}
                type="url"
                value={values.applicationUrl}
                onChange={(event) => set("applicationUrl", event.target.value)}
                placeholder="https://scholarships.gov.in"
              />
            </Field>
            <Field label="Portal Name" htmlFor={idFor("portal")} error={errors.portalName}>
              <TextInput
                id={idFor("portal")}
                value={values.portalName}
                onChange={(event) => set("portalName", event.target.value)}
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Amount" htmlFor={idFor("amount")} error={errors.amountText}>
              <TextInput
                id={idFor("amount")}
                value={values.amountText}
                onChange={(event) => set("amountText", event.target.value)}
                placeholder="₹50,000 / year"
              />
            </Field>
            <Field label="Type" required htmlFor={idFor("kind")} error={errors.aidKind}>
              <SelectInput
                id={idFor("kind")}
                value={values.aidKind}
                onChange={(event) => set("aidKind", event.target.value as AidKind)}
              >
                <option value="aid">Aid scheme</option>
                <option value="scholarship">Scholarship</option>
              </SelectInput>
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
              <TextInput
                id={idFor("verified")}
                value={formatVerifiedDate(scheme?.lastVerifiedAt ?? null)}
                disabled
                readOnly
              />
            </Field>
          </FieldGrid>
          <Field label="Eligibility Summary" htmlFor={idFor("eligibility")} error={errors.eligibilitySummary}>
            <TextArea
              id={idFor("eligibility")}
              value={values.eligibilitySummary}
              onChange={(event) => set("eligibilitySummary", event.target.value)}
            />
          </Field>
          <Field label="Benefit Summary" htmlFor={idFor("benefit")} error={errors.benefitSummary}>
            <TextArea
              id={idFor("benefit")}
              value={values.benefitSummary}
              onChange={(event) => set("benefitSummary", event.target.value)}
            />
          </Field>
          <Field
            label="States this scheme lists"
            hint="No states selected = shown nationwide. Editing states can add or remove this scheme for other regions too."
          >
            <div role="group" aria-label="States this scheme lists" className="flex flex-wrap gap-2">
              {stateOptions.map((state) => {
                const selected = values.states.includes(state);
                return (
                  <button
                    key={state}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleState(state)}
                    className={cn(
                      "h-9 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors",
                      selected
                        ? "border-[#5829c7] bg-[#f0eaff] text-[#5829c7]"
                        : "border-[#e5edf5] bg-white text-[#6b7280] hover:bg-[#fbfaff]",
                    )}
                  >
                    {state}
                  </button>
                );
              })}
            </div>
            {leavesRegion ? (
              <p className="text-xs text-[#b54708]">
                {regionState} is not selected, so this {noun} will no longer be listed for your region after saving.
              </p>
            ) : null}
          </Field>
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
            className="inline-flex h-12 min-w-[158px] cursor-pointer items-center justify-center rounded-[9px] bg-[#5829c7] px-4 text-base font-medium text-white transition-colors hover:bg-[#4a21a8] focus-visible:ring-2 focus-visible:ring-[#5829c7]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : scheme ? "Save Changes" : `Add ${noun.charAt(0).toUpperCase()}${noun.slice(1)}`}
          </button>
        </FormActions>
      </FormCard>

      {confirmingDelete && scheme ? (
        <Modal
          title={`Delete ${scheme.name}?`}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <AdminButton onClick={() => setConfirmingDelete(false)}>Cancel</AdminButton>
              <AdminButton variant="solid" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? "Deleting…" : `Delete ${noun}`}
              </AdminButton>
            </>
          }
        >
          <p>
            This {noun} is listed for: {scheme.states.length > 0 ? scheme.states.join(", ") : "nationwide"}. Deleting it
            removes it everywhere it is listed, not just in your region. This cannot be undone.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
