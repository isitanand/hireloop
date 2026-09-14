import type { ReactNode } from "react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import Sidebar from "./Sidebar";
import Spinner from "./Spinner";
import ThemeToggle from "./ThemeToggle";

function IconMenu(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  );
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="sm:pl-64">
        <header className="sm:hidden h-14 flex items-center justify-between px-4 border-b border-line-soft bg-bg/90 backdrop-blur-md sticky top-0 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-text"
            aria-label="Open menu"
          >
            <IconMenu className="text-[19px]" />
          </button>
          <Link to="/dashboard" className="font-display font-semibold text-text tracking-tight">
            HireLoop
          </Link>
          <ThemeToggle />
        </header>
        <main className="max-w-6xl mx-auto px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
