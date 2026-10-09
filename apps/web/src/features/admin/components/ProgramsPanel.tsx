import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  AdminProgramInputSchema,
  type AdminDiscipline,
  type AdminProgram,
  type VerificationStatus,
} from "@yuvapath/contracts";
import {
  useCreateProgram,
  useDeleteProgram,
  useUpdateProgram,
} from "../hooks/useAdminCatalog";
import {
  AdminButton,
  Field,
  Modal,
  SelectInput,
  StatusDot,
  STATUS_LABEL,
  StatusSelectInput,
  TextInput,
  adminErrorMessage,
  useAdminToast,
} from "./admin-ui";
import { FieldGrid, FormError, fieldErrors } from "./detail-shell";

type ProgramFormState = {
  disciplineId: string;
  programName: string;
  qualificationLevel: string;
  durationBand: string;
  admissionRoute: string;
  feesBand: string;
  verificationStatus: VerificationStatus;
};

const toState = (program: AdminProgram | undefined, disciplines: readonly AdminDiscipline[]): ProgramFormState => ({
  disciplineId: program?.disciplineId ?? disciplines[0]?.id ?? "",
  programName: program?.programName ?? "",
  qualificationLevel: program?.qualificationLevel ?? "UG Degree",
  durationBand: program?.durationBand ?? "",
  admissionRoute: program?.admissionRoute ?? "",
  feesBand: program?.feesBand ?? "",
  verificationStatus: program?.verificationStatus ?? "unverified",
});

type ProgramCardProps = {
  collegeId: string;
  disciplines: readonly AdminDiscipline[];
  /** Undefined = a draft that has not been saved yet. */
  program?: AdminProgram;
  onDraftClosed?: () => void;
};

/** One program, saved on its own — same fields/validation approach as the college form above. */
function ProgramCard({ collegeId, disciplines, program, onDraftClosed }: ProgramCardProps) {
  const [values, setValues] = useState<ProgramFormState>(() => toState(program, disciplines));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // One key per card instance: a retried "Add program" click replays the same create.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const toast = useAdminToast();
  const ids = useId();
  const idFor = (name: string) => `${ids}-${name}`;

  const create = useCreateProgram(collegeId);
  const update = useUpdateProgram(collegeId, program?.id ?? "");
  const remove = useDeleteProgram(collegeId);
  const busy = create.isPending || update.isPending || remove.isPending;

  const set = <K extends keyof ProgramFormState>(key: K, value: ProgramFormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const save = async () => {
    const parsed = AdminProgramInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, { disciplineId: "Choose a discipline." }));
      setSubmitError("Please fix the highlighted fields.");
      return;
    }
    setSubmitError(null);
    try {
      if (program) {
        await update.mutateAsync(parsed.data);
        toast("Program saved.");
      } else {
        await create.mutateAsync({ input: parsed.data, key: idempotencyKey });
        toast("Program added.");
        onDraftClosed?.();
      }
    } catch (error) {
      const message = adminErrorMessage(error, "We couldn't save this program. Please try again.");
      setSubmitError(message);
      toast(message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!program) return;
    try {
      await remove.mutateAsync(program.id);
      toast("Program removed.");
    } catch (error) {
      setConfirmingDelete(false);
      const message = adminErrorMessage(error, "We couldn't delete this program. Please try again.");
      setSubmitError(message);
      toast(message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#e5edf5] bg-[#fbfaff] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-base font-semibold text-[#1e1b4b]">
          {values.programName.trim() || "New program"}
        </h3>
        {program ? (
          <span className="flex items-center gap-2 text-sm whitespace-nowrap text-[#1e1b4b]">
            <StatusDot status={program.verificationStatus} />
            {STATUS_LABEL[program.verificationStatus]}
          </span>
        ) : null}
      </div>

      <FieldGrid>
        <Field label="Discipline" required htmlFor={idFor("discipline")} error={errors.disciplineId}>
          <SelectInput
            id={idFor("discipline")}
            value={values.disciplineId}
            onChange={(event) => set("disciplineId", event.target.value)}
          >
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.title}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Program Name" required htmlFor={idFor("name")} error={errors.programName}>
          <TextInput
            id={idFor("name")}
            value={values.programName}
            onChange={(event) => set("programName", event.target.value)}
            placeholder="B.E. Computer Science"
          />
        </Field>
        <Field label="Qualification Level" required htmlFor={idFor("level")} error={errors.qualificationLevel}>
          <TextInput
            id={idFor("level")}
            value={values.qualificationLevel}
            onChange={(event) => set("qualificationLevel", event.target.value)}
          />
        </Field>
        <Field label="Duration" htmlFor={idFor("duration")} error={errors.durationBand}>
          <TextInput
            id={idFor("duration")}
            value={values.durationBand}
            onChange={(event) => set("durationBand", event.target.value)}
            placeholder="4 years"
          />
        </Field>
        <Field label="Admission Route" htmlFor={idFor("route")} error={errors.admissionRoute}>
          <TextInput
            id={idFor("route")}
            value={values.admissionRoute}
            onChange={(event) => set("admissionRoute", event.target.value)}
          />
        </Field>
        <Field label="Fees Band" htmlFor={idFor("fees")} error={errors.feesBand}>
          <TextInput
            id={idFor("fees")}
            value={values.feesBand}
            onChange={(event) => set("feesBand", event.target.value)}
          />
        </Field>
        <Field label="Verification Status" required htmlFor={idFor("status")}>
          <StatusSelectInput
            id={idFor("status")}
            value={values.verificationStatus}
            onChange={(value) => set("verificationStatus", value)}
          />
        </Field>
      </FieldGrid>

      <FormError message={submitError} />

      <div className="flex flex-wrap items-center justify-end gap-4">
        {program ? (
          <AdminButton disabled={busy} onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </AdminButton>
        ) : (
          <AdminButton disabled={busy} onClick={onDraftClosed}>
            Cancel
          </AdminButton>
        )}
        <AdminButton variant="solid" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : program ? "Save Program" : "Add Program"}
        </AdminButton>
      </div>

      {confirmingDelete && program ? (
        <Modal
          title={`Delete ${program.programName}?`}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <AdminButton onClick={() => setConfirmingDelete(false)}>Cancel</AdminButton>
              <AdminButton variant="solid" disabled={remove.isPending} onClick={() => void confirmDelete()}>
                {remove.isPending ? "Deleting…" : "Delete program"}
              </AdminButton>
            </>
          }
        >
          <p>This program will be removed from the college. This cannot be undone.</p>
        </Modal>
      ) : null}
    </div>
  );
}

/** The college's programs, below the college form — same card styling, one card per program. */
export function ProgramsPanel({
  collegeId,
  programs,
  disciplines,
}: {
  collegeId: string;
  programs: readonly AdminProgram[];
  disciplines: readonly AdminDiscipline[];
}) {
  const [drafts, setDrafts] = useState<string[]>([]);

  return (
    <section className="mt-6 flex flex-col gap-4 rounded-xl border border-[#e5edf5] bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-[#1e1b4b]">Programs ({programs.length})</h2>
        <AdminButton
          variant="tint"
          disabled={disciplines.length === 0}
          onClick={() => setDrafts((current) => [...current, crypto.randomUUID()])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add program
        </AdminButton>
      </div>

      {drafts.map((draftId) => (
        <ProgramCard
          key={draftId}
          collegeId={collegeId}
          disciplines={disciplines}
          onDraftClosed={() => setDrafts((current) => current.filter((id) => id !== draftId))}
        />
      ))}
      {programs.map((program) => (
        <ProgramCard key={program.id} collegeId={collegeId} disciplines={disciplines} program={program} />
      ))}
      {programs.length === 0 && drafts.length === 0 ? (
        <p className="text-sm text-[#7c8295]">No programs added yet.</p>
      ) : null}
    </section>
  );
}
