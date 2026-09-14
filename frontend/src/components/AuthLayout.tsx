import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogoBadge } from "./Logo";

// Same light background as the landing hero (glow-bg + noise-grid). The card
// carries the wordmark itself so it reads as one self-contained object rather
// than a plain box with a logo floating loose above it, and it takes a real
// shadow - .panel's light-mode shadow is near-flat by design for in-page
// cards, which leaves it looking inert against a background this active.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 glow-bg pointer-events-none" />
      <div className="absolute inset-0 noise-grid pointer-events-none" />

      {/* Extra bottom padding pulls the centred card up off true centre - on a
          tall screen, dead-centre reads as marooned rather than composed. */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-12 sm:pb-[14vh]">
        <div className="w-full max-w-[25rem]">
          <div className="rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-24px_rgba(23,24,28,0.3)] p-7 sm:p-8">
            <Link to="/" className="flex items-center gap-2.5 w-fit">
              <LogoBadge />
              <span className="font-display font-semibold text-text tracking-tight">HireLoop</span>
            </Link>
            <div className="mt-6 pt-6 border-t border-line-soft">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
