import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAidDetailPage,
  AdminCollegeDetailPage,
  AdminCollegesPage,
  AdminSessionProvider,
} from "@/features/admin";
import { queryClient } from "@/lib/query-client";

const api = vi.hoisted(() => ({
  listAdminColleges: vi.fn<(params: unknown) => Promise<unknown>>(),
  getAdminCollege: vi.fn<(id: string) => Promise<unknown>>(),
  updateAdminCollege: vi.fn<(id: string, patch: unknown) => Promise<unknown>>(),
  deleteAdminCollege: vi.fn<(id: string) => Promise<unknown>>(),
  listAdminDisciplines: vi.fn<() => Promise<unknown>>(),
  getAdminOverview: vi.fn<() => Promise<unknown>>(),
  getAdminAidScheme: vi.fn<(id: string) => Promise<unknown>>(),
  updateAdminAidScheme: vi.fn<(id: string, patch: unknown) => Promise<unknown>>(),
}));

vi.mock("@/features/admin/api/admin-catalog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...api,
}));

const collegeId = "00000000-0000-4000-8000-000000000c01";
const schemeId = "00000000-0000-4000-8000-000000000a01";

const college = {
  id: collegeId,
  name: "Government Arts College",
  city: "Chennai",
  state: "Tamil Nadu",
  institutionType: "College",
  tier: 1,
  admissionRoute: "TNEA Counselling",
  feesBand: null,
  websiteUrl: "https://www.gac.ac.in",
  verificationStatus: "verified",
  lastVerifiedAt: "2026-09-18T00:00:00.000Z",
  programCount: 8,
};

const overview = {
  state: "Tamil Nadu",
  displayName: "TN Admin",
  collegeCount: 2,
  programCount: 8,
  aidCount: 1,
  scholarshipCount: 1,
  unverifiedColleges: 1,
  recentActivity: [],
};

function renderAt(path: string) {
  localStorage.setItem("yuvapath.adminUserId", "admin-id");
  localStorage.setItem("yuvapath.adminDisplayName", "TN Admin");
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminSessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/colleges" element={<AdminCollegesPage />} />
            <Route path="/admin/colleges/:collegeId" element={<AdminCollegeDetailPage />} />
            <Route path="/admin/scholarships/:schemeId" element={<AdminAidDetailPage kind="scholarship" />} />
            <Route path="/admin/scholarships" element={<div>Scholarships list</div>} />
            <Route path="/admin/sign-in" element={<div>Admin sign-in screen</div>} />
          </Routes>
        </MemoryRouter>
      </AdminSessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  vi.clearAllMocks();
  api.getAdminOverview.mockResolvedValue(overview);
  api.listAdminDisciplines.mockResolvedValue({
    data: [{ id: "00000000-0000-4000-8000-0000000000d1", title: "Computer Science" }],
  });
});

describe("regional admin console", () => {
  it("sends a signed-out visitor to the admin sign-in screen", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AdminSessionProvider>
          <MemoryRouter initialEntries={["/admin/colleges"]}>
            <Routes>
              <Route path="/admin/colleges" element={<AdminCollegesPage />} />
              <Route path="/admin/sign-in" element={<div>Admin sign-in screen</div>} />
            </Routes>
          </MemoryRouter>
        </AdminSessionProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Admin sign-in screen")).toBeInTheDocument();
  });

  it("lists colleges with status counts in the filter and sends the search to the API", async () => {
    api.listAdminColleges.mockResolvedValue({
      data: [college],
      total: 1,
      page: 1,
      pageSize: 20,
      statusCounts: { all: 6, verified: 2, unverified: 3, stale: 1, retired: 0 },
    });
    const user = userEvent.setup();
    renderAt("/admin/colleges");

    const row = await screen.findByRole("row", { name: /Government Arts College/ });
    expect(within(row).getByText("https://www.gac.ac.in")).toBeInTheDocument();
    expect(within(row).getByText("Tier 1")).toBeInTheDocument();
    expect(within(row).getByText("Verified")).toBeInTheDocument();
    expect(row).toHaveAttribute("href", `/admin/colleges/${collegeId}`);

    await user.click(screen.getByRole("button", { name: /^All/ }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: /Unverified\s*3/ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.type(screen.getByRole("searchbox"), "arts");
    await waitFor(() =>
      expect(api.listAdminColleges).toHaveBeenLastCalledWith(expect.objectContaining({ q: "arts" })),
    );
  });

  it("saves only valid edits and surfaces validation errors for required fields", async () => {
    api.getAdminCollege.mockResolvedValue({ ...college, programs: [] });
    api.updateAdminCollege.mockResolvedValue({ ...college, programs: [] });
    const user = userEvent.setup();
    renderAt(`/admin/colleges/${collegeId}`);

    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(api.updateAdminCollege).not.toHaveBeenCalled();

    await user.type(name, "Government Arts College (Autonomous)");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api.updateAdminCollege).toHaveBeenCalledTimes(1));
    expect(api.updateAdminCollege).toHaveBeenCalledWith(
      collegeId,
      expect.objectContaining({ name: "Government Arts College (Autonomous)", state: "Tamil Nadu", tier: 1 }),
    );
  });

  it("asks for confirmation before deleting a college and lists the programs that go with it", async () => {
    api.getAdminCollege.mockResolvedValue({
      ...college,
      programCount: 1,
      programs: [
        {
          id: "00000000-0000-4000-8000-0000000000e1",
          collegeId,
          disciplineId: "00000000-0000-4000-8000-0000000000d1",
          disciplineTitle: "Computer Science",
          programName: "B.E. Computer Science",
          qualificationLevel: "UG Degree",
          durationBand: "4 years",
          admissionRoute: null,
          feesBand: null,
          verificationStatus: "verified",
          lastVerifiedAt: null,
        },
      ],
    });
    api.deleteAdminCollege.mockResolvedValue({ deleted: true, removedPrograms: 1 });
    const user = userEvent.setup();
    renderAt(`/admin/colleges/${collegeId}`);

    const deleteButtons = await screen.findAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Program: B.E. Computer Science")).toBeInTheDocument();
    expect(api.deleteAdminCollege).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete college" }));
    // react-query passes extra context arguments after the variables, so only check the first.
    await waitFor(() => expect(api.deleteAdminCollege).toHaveBeenCalled());
    expect(api.deleteAdminCollege.mock.calls[0]?.[0]).toBe(collegeId);
  });

  it("warns when an aid scheme edit drops the admin's own state from its listing", async () => {
    api.getAdminAidScheme.mockResolvedValue({
      id: schemeId,
      aidCode: "tn-first-graduate",
      name: "TN First Graduate Scholarship",
      aidKind: "scholarship",
      providerType: "state",
      provider: "Dept. of Collegiate Education",
      level: "UG Degree",
      states: ["Tamil Nadu"],
      eligibilitySummary: null,
      benefitSummary: null,
      amountText: null,
      applicationUrl: "https://tnfgs.tn.gov.in",
      portalName: null,
      verificationStatus: "verified",
      lastVerifiedAt: "2026-09-18T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderAt(`/admin/scholarships/${schemeId}`);

    const tamilNadu = await screen.findByRole("button", { name: "Tamil Nadu" });
    expect(tamilNadu).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Karnataka" }));
    await user.click(tamilNadu);
    expect(screen.getByText(/will no longer be listed for your region/)).toBeInTheDocument();
  });
});
