import { Link } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout";
import { adminErrorMessage } from "../components/admin-ui";
import { useAdminOverview } from "../hooks/useAdminCatalog";

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function StatTile({ label, value, to }: { label: string; value: number | undefined; to: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-2 rounded-xl border border-[#e5edf5] bg-white p-6 transition-colors hover:bg-[#fbfaff]"
    >
      <span className="text-sm font-medium text-[#6b7280]">{label}</span>
      <span className="text-[32px] leading-[normal] font-semibold text-[#1e1b4b] tabular-nums">
        {value === undefined ? "—" : value.toLocaleString("en-IN")}
      </span>
    </Link>
  );
}

/** Regional admin landing screen: what is registered for the admin's state, and what changed. */
export function AdminHomePage() {
  const overview = useAdminOverview();
  const data = overview.data;

  return (
    <AdminLayout>
      <div className="pt-[29px]">
        <div className="flex flex-col gap-[9px]">
          <h1 className="text-[32px] leading-[normal] font-semibold text-[#1e1b4b]">
            {data ? `Welcome, ${data.displayName}` : "Dashboard"}
          </h1>
          <p className="text-base leading-[normal] text-[#7c8295]">
            {data
              ? `Here is what is registered for ${data.state} today, and what still needs review.`
              : "Colleges, programs and financial aid for your region."}
          </p>
        </div>

        {overview.isError ? (
          <p role="alert" className="mt-8 text-base text-[#db3030]">
            {adminErrorMessage(overview.error, "We couldn't load the dashboard. Please try again.")}
          </p>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={`Colleges${data ? ` in ${data.state}` : ""}`} value={data?.collegeCount} to="/admin/colleges" />
          <StatTile label="College programs" value={data?.programCount} to="/admin/colleges" />
          <StatTile label="Aid schemes" value={data?.aidCount} to="/admin/aid-schemes" />
          <StatTile label="Scholarships" value={data?.scholarshipCount} to="/admin/scholarships" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
          <Link
            to="/admin/colleges?status=unverified"
            className="flex flex-col gap-2 rounded-xl border border-[#e5edf5] bg-white p-6 transition-colors hover:bg-[#fbfaff]"
          >
            <span className="text-sm font-medium text-[#6b7280]">Unverified colleges</span>
            <span
              className="text-[32px] leading-[normal] font-semibold tabular-nums"
              style={{ color: data && data.unverifiedColleges > 0 ? "#F79009" : "#12B76A" }}
            >
              {data === undefined ? "—" : data.unverifiedColleges.toLocaleString("en-IN")}
            </span>
            <span className="text-sm text-[#7c8295]">Review these to keep recommendations trustworthy.</span>
          </Link>

          <section className="rounded-xl border border-[#e5edf5] bg-white p-6">
            <h2 className="mb-4 text-xl font-semibold text-[#1e1b4b]">Recent activity</h2>
            {data && data.recentActivity.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {data.recentActivity.map((entry) => (
                  <li key={`${entry.at}-${entry.text}`} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="text-[#1e1b4b]">{entry.text}</span>
                    <span className="text-[#7c8295]">{TIME_FORMAT.format(new Date(entry.at))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#7c8295]">Nothing yet — actions you take will show up here.</p>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
