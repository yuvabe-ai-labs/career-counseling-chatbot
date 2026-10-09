import { Plus, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AdminCollege } from "@yuvapath/contracts";
import { AdminButton, adminErrorMessage, StatusDot, STATUS_LABEL } from "../components/admin-ui";
import { AdminLayout } from "../components/AdminLayout";
import { CatalogList, NameCell } from "../components/CatalogList";
import { useAdminColleges } from "../hooks/useAdminCatalog";
import { useListParams } from "../hooks/useListParams";

const GRID = "grid-cols-[323fr_151fr_151fr_121fr_121fr_141fr]";

/** Figma "admin clg list" (1037:1297): Colleges & Programs list. */
export function AdminCollegesPage() {
  const navigate = useNavigate();
  const { q, status, page, params, update } = useListParams();
  const colleges = useAdminColleges(params);

  return (
    <AdminLayout>
      <CatalogList<AdminCollege>
        title="Colleges & Programs"
        subtitle="Manage colleges, programs and regional admission information."
        searchPlaceholder="Search by college name or city"
        search={q}
        onSearch={(value) => update({ q: value })}
        status={status}
        onStatus={(value) => update({ status: value })}
        counts={colleges.data?.statusCounts}
        actions={
          <>
            <AdminButton className="w-[158px]" onClick={() => void navigate("/admin/bulk-upload?category=colleges")}>
              <Upload className="size-4" aria-hidden="true" />
              Bulk upload
            </AdminButton>
            <AdminButton variant="tint" className="w-[158px]" onClick={() => void navigate("/admin/colleges/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Add college
            </AdminButton>
          </>
        }
        gridClass={GRID}
        columns={[
          { label: "College / Institution" },
          { label: "City" },
          { label: "Type" },
          { label: "Tier" },
          { label: "Programs", align: "right" },
          { label: "Status" },
        ]}
        items={colleges.data?.data}
        itemKey={(college) => college.id}
        itemHref={(college) => `/admin/colleges/${college.id}`}
        cells={(college) => [
          <NameCell key="name" title={college.name} subtitle={college.websiteUrl} />,
          <span key="city" className="block truncate">{college.city}</span>,
          <span key="type" className="block truncate">{college.institutionType}</span>,
          <span key="tier">{college.tier ? `Tier ${college.tier}` : "—"}</span>,
          <span key="programs">{college.programCount}</span>,
          <span key="status" className="flex items-center gap-2 whitespace-nowrap">
            <StatusDot status={college.verificationStatus} />
            {STATUS_LABEL[college.verificationStatus]}
          </span>,
        ]}
        isLoading={colleges.isLoading}
        errorMessage={
          colleges.isError ? adminErrorMessage(colleges.error, "We couldn't load colleges. Please try again.") : null
        }
        emptyMessage="No colleges match these filters."
        page={page}
        pageSize={params.pageSize}
        total={colleges.data?.total ?? 0}
        onPage={(next) => update({ page: next })}
      />
    </AdminLayout>
  );
}
