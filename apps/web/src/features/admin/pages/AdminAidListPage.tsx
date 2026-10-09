import { Plus, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AdminAidScheme, AidKind } from "@yuvapath/contracts";
import { AdminButton, adminErrorMessage, StatusDot, STATUS_LABEL } from "../components/admin-ui";
import { AdminLayout } from "../components/AdminLayout";
import { CatalogList, NameCell } from "../components/CatalogList";
import { useAdminAidSchemes } from "../hooks/useAdminCatalog";
import { useListParams } from "../hooks/useListParams";

const GRID = "grid-cols-[323fr_191fr_191fr_161fr_141fr]";

export const AID_KIND_COPY: Record<
  AidKind,
  { title: string; noun: string; nounPlural: string; basePath: string; subtitle: string }
> = {
  aid: {
    title: "Aid Schemes",
    noun: "scheme",
    nounPlural: "schemes",
    basePath: "/admin/aid-schemes",
    subtitle: "Manage financial aid schemes available to students in your region.",
  },
  scholarship: {
    title: "Scholarships",
    noun: "scholarship",
    nounPlural: "scholarships",
    basePath: "/admin/scholarships",
    subtitle: "Manage scholarships and fellowships available to students in your region.",
  },
};

/** Aid Schemes and Scholarships: the Colleges list pattern over knowledge.aid_schemes. */
export function AdminAidListPage({ kind }: { kind: AidKind }) {
  const copy = AID_KIND_COPY[kind];
  const navigate = useNavigate();
  const { q, status, page, params, update } = useListParams();
  const schemes = useAdminAidSchemes(kind, params);
  const addLabel = `Add ${copy.noun}`;

  return (
    <AdminLayout>
      <CatalogList<AdminAidScheme>
        title={copy.title}
        subtitle={copy.subtitle}
        searchPlaceholder={`Search by ${copy.noun} name or provider`}
        search={q}
        onSearch={(value) => update({ q: value })}
        status={status}
        onStatus={(value) => update({ status: value })}
        counts={schemes.data?.statusCounts}
        actions={
          <>
            <AdminButton className="w-[158px]" onClick={() => void navigate("/admin/bulk-upload?category=aid")}>
              <Upload className="size-4" aria-hidden="true" />
              Bulk upload
            </AdminButton>
            <AdminButton
              variant="tint"
              className="min-w-[158px]"
              onClick={() => void navigate(`${copy.basePath}/new`)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {addLabel}
            </AdminButton>
          </>
        }
        gridClass={GRID}
        columns={[
          { label: `${kind === "aid" ? "Scheme" : "Scholarship"} / Provider` },
          { label: "Level" },
          { label: "States" },
          { label: "Amount" },
          { label: "Status" },
        ]}
        items={schemes.data?.data}
        itemKey={(scheme) => scheme.id}
        itemHref={(scheme) => `${copy.basePath}/${scheme.id}`}
        cells={(scheme) => [
          <NameCell key="name" title={scheme.name} subtitle={scheme.provider} />,
          <span key="level" className="block truncate">{scheme.level}</span>,
          <span key="states" className="block truncate">
            {scheme.states.length > 0 ? scheme.states.join(", ") : "Nationwide"}
          </span>,
          <span key="amount" className="block truncate">{scheme.amountText ?? "—"}</span>,
          <span key="status" className="flex items-center gap-2 whitespace-nowrap">
            <StatusDot status={scheme.verificationStatus} />
            {STATUS_LABEL[scheme.verificationStatus]}
          </span>,
        ]}
        isLoading={schemes.isLoading}
        errorMessage={
          schemes.isError
            ? adminErrorMessage(schemes.error, `We couldn't load ${copy.nounPlural}. Please try again.`)
            : null
        }
        emptyMessage={`No ${copy.nounPlural} match these filters.`}
        page={page}
        pageSize={params.pageSize}
        total={schemes.data?.total ?? 0}
        onPage={(next) => update({ page: next })}
      />
    </AdminLayout>
  );
}
