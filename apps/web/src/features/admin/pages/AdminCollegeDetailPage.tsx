import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout";
import { ProgramsPanel } from "../components/ProgramsPanel";
import { CollegeForm } from "../components/CollegeForm";
import { adminErrorMessage, useAdminToast } from "../components/admin-ui";
import { DetailShell } from "../components/detail-shell";
import {
  useAdminCollege,
  useAdminDisciplines,
  useCreateCollege,
  useDeleteCollege,
  useUpdateCollege,
} from "../hooks/useAdminCatalog";
import { useAdminOverview } from "../hooks/useAdminCatalog";

function CollegeDetailContent({ collegeId }: { collegeId: string | undefined }) {
  const navigate = useNavigate();
  const toast = useAdminToast();
  const isNew = collegeId === undefined;
  const college = useAdminCollege(collegeId);
  const disciplines = useAdminDisciplines();
  const overview = useAdminOverview();
  const create = useCreateCollege();
  const update = useUpdateCollege(collegeId ?? "");
  const remove = useDeleteCollege();
  // One key per opened "Add college" form: a retried submit replays instead of duplicating.
  const [createKey] = useState(() => crypto.randomUUID());

  if (!isNew && college.isError) {
    return (
      <DetailShell backTo="/admin/colleges" backLabel="Back to colleges" title="College unavailable">
        <p role="alert" className="text-base text-[#db3030]">
          {adminErrorMessage(college.error, "We couldn't load this college. Please try again.")}
        </p>
      </DetailShell>
    );
  }
  if (!isNew && !college.data) {
    return (
      <DetailShell backTo="/admin/colleges" backLabel="Back to colleges" title="Loading…">
        <span className="sr-only">Loading college</span>
      </DetailShell>
    );
  }
  if (isNew && !overview.data) {
    // The region (state) comes from the signed-in admin's scope, so wait for it before showing
    // the blank form rather than flashing an empty State field.
    return (
      <DetailShell backTo="/admin/colleges" backLabel="Back to colleges" title="Add college">
        {overview.isError ? (
          <p role="alert" className="text-base text-[#db3030]">
            {adminErrorMessage(overview.error, "We couldn't load your region. Please try again.")}
          </p>
        ) : null}
      </DetailShell>
    );
  }

  const current = college.data;
  const defaultState = overview.data?.state ?? current?.state ?? "";

  return (
    <DetailShell
      backTo="/admin/colleges"
      backLabel="Back to colleges"
      title={current?.name ?? "Add college"}
      subtitle={current ? `${current.city}, ${current.state}` : `New college in ${defaultState}`}
    >
      <CollegeForm
        key={current?.id ?? "new"}
        {...(current ? { college: current } : {})}
        defaultState={defaultState}
        saving={create.isPending || update.isPending}
        deleting={remove.isPending}
        onSave={async (input) => {
          if (current) {
            await update.mutateAsync(input);
            toast("College saved.");
          } else {
            const created = await create.mutateAsync({ input, key: createKey });
            toast("College added. You can add its programs now.");
            void navigate(`/admin/colleges/${created.id}`, { replace: true });
          }
        }}
        {...(current
          ? {
              onDelete: async () => {
                const result = await remove.mutateAsync(current.id);
                toast(
                  result.removedPrograms > 0
                    ? `College deleted along with ${result.removedPrograms} program(s).`
                    : "College deleted.",
                );
                void navigate("/admin/colleges", { replace: true });
              },
            }
          : {})}
      />
      {current ? (
        <ProgramsPanel
          collegeId={current.id}
          programs={current.programs}
          disciplines={disciplines.data?.data ?? []}
        />
      ) : null}
    </DetailShell>
  );
}

/** Figma "admin clg list" detail frame (996:4503) — edit/delete a college and its programs. */
export function AdminCollegeDetailPage() {
  const { collegeId } = useParams<{ collegeId: string }>();
  return (
    <AdminLayout>
      <CollegeDetailContent collegeId={collegeId} />
    </AdminLayout>
  );
}
