import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleUser, LogOut, Menu } from "lucide-react";
import { Navigate, NavLink, useNavigate } from "react-router-dom";
import { Brand } from "@/components/Brand";
import { useEscapeKey } from "@/lib/use-escape-key";
import { cn } from "@/lib/utils";
import { useAdminSession } from "../state/admin-session-context";
import { ToastProvider } from "./admin-ui";

const NAV_ITEMS = [
  { to: "/admin/home", label: "Dashboard" },
  { to: "/admin/colleges", label: "Colleges & Programs" },
  { to: "/admin/aid-schemes", label: "Aid Schemes" },
  { to: "/admin/scholarships", label: "Scholarships" },
  { to: "/admin/careers", label: "Career" },
] as const;

const navItemClass = (active: boolean) =>
  cn(
    "flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-4 text-left text-base font-semibold transition-colors",
    active ? "bg-[#f0eaff] text-[#5829c7]" : "text-[#6b7280] hover:bg-[#f8f4ff]",
  );

/**
 * Shell for every regional-admin screen — Figma "admin clg list" frames: a 68px gradient header
 * (wordmark left, account icon right), a 244px white side nav and a content column that starts
 * 36px right of the nav. Also the route guard: no admin session means the sign-in screen.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const session = useAdminSession();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEscapeKey(menuOpen, closeMenu);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (!session.userId) {
    return <Navigate to="/admin/sign-in" replace />;
  }

  const signOut = () => {
    session.reset();
    void navigate("/admin/sign-in", { replace: true });
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#f8f7fb] font-display text-[#1e1b4b]">
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e5edf5] bg-gradient-to-b from-[#f8f4ff] via-[#faf8ff] to-[#fdfbff] px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setNavOpen(true)}
              className="grid size-9 cursor-pointer place-items-center rounded-lg text-[#1e1b4b] hover:bg-white/60 lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <Brand />
          </div>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="grid size-8 cursor-pointer place-items-center rounded-full text-[#1e1b4b]"
            >
              <CircleUser className="size-8" strokeWidth={1.5} aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute top-11 right-0 w-56 rounded-lg border border-[#e5edf5] bg-white p-1 shadow-[0px_6px_16px_0px_rgba(30,22,70,0.12)]"
              >
                <p className="truncate px-3 py-2 text-sm font-medium text-[#1e1b4b]">
                  {session.displayName ?? "Regional admin"}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#6b7280] hover:bg-[#f8f4ff]"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <div className="flex">
          {navOpen ? (
            <div
              className="fixed inset-0 z-30 bg-[#1e1b4b]/40 lg:hidden"
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
            />
          ) : null}
          <aside
            className={cn(
              "z-40 flex w-[244px] shrink-0 flex-col bg-white shadow-[0px_3.125px_17.578px_0px_rgba(0,0,0,0.08)]",
              "fixed top-[68px] bottom-0 left-0 -translate-x-full transition-transform lg:sticky lg:h-[calc(100vh-68px)] lg:translate-x-0",
              navOpen && "translate-x-0",
            )}
          >
            <nav aria-label="Regional admin" className="flex flex-col gap-4 px-4 pt-6">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) => navItemClass(isActive)}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5 shrink-0 rounded-[4px]", isActive ? "bg-[#5829c7]" : "bg-[#6b7280]")}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto px-4 pb-6">
              <button type="button" onClick={signOut} className={navItemClass(false)}>
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-4 pb-16 sm:px-9">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
