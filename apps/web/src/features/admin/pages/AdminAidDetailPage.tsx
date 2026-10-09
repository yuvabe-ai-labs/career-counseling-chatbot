import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AidKind } from "@yuvapath/contracts";
import { AidForm } from "../components/AidForm";
import { AdminLayout } from "../components/AdminLayout";
import { adminErrorMessage, useAdminToast } from "../components/admin-ui";
import { DetailShell } from "../components/detail-shell";
import {
  useAdminAidScheme,
  useAdminOverview,
  useCreateAidScheme,
  useDeleteAidScheme,
  useUpdateAidScheme,
} from "../hooks/useAdminCatalog";
import { AID_KIND_COPY } from "./AdminAidListPage";

function AidDetailContent({ kind, schemeId }: { kind: AidKind; schemeId: string | undefined }) {
  const copy = AID_KIND_COPY[kind];
  const backLabel = `Back to ${copy.title.toLowerCase()}`;
  const navigate = useNavigate();
  const toast = useAdminToast();
  const isNew = schemeId === undefined;
  const scheme = useAdminAidScheme(schemeId);
  const overview = useAdminOverview();
  const create = useCreateAidScheme();
  const update = useUpdateAidScheme(schemeId ?? "");
  const remove = useDeleteAidScheme();
  const [createKey] = useState(() => crypto.randomUUID());

  if (!isNew && scheme.isError) {
    return (
      <DetailShell backTo={copy.basePath} backLabel={backLabel} title={`${copy.noun} unavailable`}>
        <p role="alert" className="text-base text-[#db3030]">
          {adminErrorMessage(scheme.error, `We couldn't load this ${copy.noun}. Please try again.`)}
        </p>
      </DetailShell>
    );
  }
  if ((!isNew && !scheme.data) || !overview.data) {
    return (
      <DetailShell backTo={copy.basePath} backLabel={backLabel} title={isNew ? `Add ${copy.noun}` : "Loading…"}>
        {overview.isError ? (
          <p role="alert" className="text-base text-[#db3030]">
            {adminErrorMessage(overview.error, "We couldn't load your region. Please try again.")}
          </p>
        ) : (
          <span className="sr-only">Loading</span>
        )}
      </DetailShell>
    );
  }

  const current = scheme.data;
  return (
    <DetailShell
      backTo={copy.basePath}
      backLabel={backLabel}
      title={current?.name ?? `Add ${copy.noun}`}
      subtitle={current ? current.provider : `New ${copy.noun} for ${overview.data.state}`}
    >
      <AidForm
        key={current?.id ?? "new"}
        {...(current ? { scheme: current } : {})}
        kind={kind}
        regionState={overview.data.state}
        noun={copy.noun}
        saving={create.isPending || update.isPending}
        deleting={remove.isPending}
        onSave={async (input) => {
          if (current) {
            await update.mutateAsync(input);
            toast(`${copy.noun.charAt(0).toUpperCase()}${copy.noun.slice(1)} saved.`);
          } else {
            const created = await create.mutateAsync({ input, key: createKey });
            toast(`${copy.noun.charAt(0).toUpperCase()}${copy.noun.slice(1)} added.`);
            const base = AID_KIND_COPY[created.aidKind].basePath;
            void navigate(`${base}/${created.id}`, { replace: true });
          }
        }}
        {...(current
          ? {
              onDelete: async () => {
                await remove.mutateAsync(current.id);
                toast(`${copy.noun.charAt(0).toUpperCase()}${copy.noun.slice(1)} deleted.`);
                void navigate(copy.basePath, { replace: true });
              },
            }
          : {})}
      />
    </DetailShell>
  );
}

/** Aid scheme / scholarship detail — the college detail screen's pattern over aid_schemes. */
export function AdminAidDetailPage({ kind }: { kind: AidKind }) {
  const { schemeId } = useParams<{ schemeId: string }>();
  return (
    <AdminLayout>
      <AidDetailContent kind={kind} schemeId={schemeId} />
    </AdminLayout>
  );
}
