import { AdminLayout } from "../components/AdminLayout";

/** Placeholder for nav entries (Career) that exist in the Figma nav but have no design yet. */
export function AdminComingSoonPage({ title }: { title: string }) {
  return (
    <AdminLayout>
      <div className="pt-[29px]">
        <h1 className="text-[32px] leading-[normal] font-semibold text-[#1e1b4b]">{title}</h1>
        <p className="mt-[9px] text-base text-[#7c8295]">This section is not available yet.</p>
      </div>
    </AdminLayout>
  );
}
