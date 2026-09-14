import clsx from "clsx";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import AddApplicationModal from "./AddApplicationModal";
import { LogoBadge } from "./Logo";
import ThemeToggle from "./ThemeToggle";
import {
  IconBuilding,
  IconCalendar,
  IconChart,
  IconGrid,
  IconLogout,
  IconPlus,
  IconSettings,
  IconTarget,
  IconTrack,
  IconUser,
} from "./icons";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: IconGrid },
  { to: "/applications", label: "Applications", icon: IconBuilding },
  { to: "/tracker", label: "Tracker", icon: IconTrack },
  { to: "/calendar", label: "Calendar", icon: IconCalendar },
  { to: "/analytics", label: "Analytics", icon: IconChart },
];

const ACCOUNT_LINKS = [
  { to: "/settings?tab=Profile", label: "Profile", icon: IconUser, match: "Profile" },
  { to: "/settings?tab=Account", label: "Settings", icon: IconSettings, match: "Account" },
];

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted/70">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const loc = useLocation();
  const activeTab = new URLSearchParams(loc.search).get("tab");
  const initial = (user?.name?.trim()[0] || user?.email?.trim()[0] || "?").toUpperCase();

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 sm:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-line bg-surface flex flex-col transition-transform sm:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link
          to="/dashboard"
          className="h-16 flex items-center gap-2.5 px-5 border-b border-line-soft shrink-0 hover:bg-surface-hover transition-colors"
        >
          <LogoBadge />
          <span className="font-display font-semibold text-text tracking-tight">HireLoop</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
          <NavGroup title="Workspace">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={onClose}
                className={({ isActive }) =>
                  clsx(
                    "relative flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:text-text hover:bg-surface-hover",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-accent" />
                    )}
                    <l.icon className="text-[17px]" />
                    {l.label}
                  </>
                )}
              </NavLink>
            ))}
          </NavGroup>

          <NavGroup title="Account">
            {ACCOUNT_LINKS.map((l) => {
              // Settings has four tabs (Profile, Filters, Companies, Account)
              // but only two of them are sidebar links, so anything that isn't
              // Profile belongs under "Settings" - matching on the exact tab
              // name left ?tab=Filters and ?tab=Companies highlighting neither,
              // i.e. no "you are here" at all while sitting on that page.
              const tab = activeTab ?? "Profile";
              const isActive =
                loc.pathname === "/settings" &&
                (l.match === "Profile" ? tab === "Profile" : tab !== "Profile");
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={onClose}
                  className={clsx(
                    "relative flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:text-text hover:bg-surface-hover",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-accent" />
                  )}
                  <l.icon className="text-[17px]" />
                  {l.label}
                </NavLink>
              );
            })}
          </NavGroup>
        </nav>

        <div className="p-3 border-t border-line-soft shrink-0 space-y-3">
          <div className="rounded-xl border border-dashed border-line p-3.5">
            <div className="h-8 w-8 rounded-lg tint-blue flex items-center justify-center mb-2.5">
              <IconTarget className="text-[16px]" />
            </div>
            <div className="text-xs font-semibold text-text">Keep your search organized</div>
            <div className="text-[11px] text-muted mt-0.5">Every role, in one place.</div>
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl text-sm font-semibold px-4 py-2.5 bg-text text-bg hover:opacity-90 transition-opacity"
          >
            <IconPlus className="text-[15px]" />
            Add application
          </button>

          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-hover px-2.5 py-2.5">
            <Link to="/settings?tab=Profile" className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent to-warmth text-white flex items-center justify-center font-display font-bold text-sm shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate">{user?.name || "Your account"}</div>
                <div className="text-xs text-muted truncate">{user?.email}</div>
              </div>
            </Link>
            <div className="flex items-center gap-0.5 shrink-0">
              <ThemeToggle />
              <button
                onClick={logout}
                aria-label="Log out"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
              >
                <IconLogout className="text-[15px]" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {showAdd && <AddApplicationModal onClose={() => setShowAdd(false)} />}
    </>
  );
}
