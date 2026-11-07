import { IconBuilding, IconMapPin, IconSpark, IconTrack } from "./icons";

// A miniature, honest sketch of the real dashboard - not a stock illustration,
// not a screenshot that goes stale the moment a page changes. Framed like a
// browser window so it reads as "here is the actual product" rather than
// generic hero art.
export default function ProductPeek() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-accent/10 blur-3xl rounded-full" />
      <div className="relative rounded-2xl border border-line bg-surface shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] overflow-hidden rotate-[1.2deg]">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-line-soft bg-bg/40">
          <span className="h-2.5 w-2.5 rounded-full bg-bad/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-good/60" />
          <span className="ml-3 text-[11px] text-muted font-mono">hireloop.app/dashboard</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-sm font-semibold text-text">Dashboard</div>
              <div className="text-[11px] text-muted mt-0.5">3 new matches today</div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold bg-text text-bg px-2.5 py-1.5 rounded-lg">
              <IconTrack className="text-[11px]" />
              Run search
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Scanned", value: "1,506" },
              { label: "Filtered", value: "26" },
              { label: "Shortlisted", value: "3" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-bg border border-line-soft px-2.5 py-2">
                <div className="text-[10px] text-muted">{s.label}</div>
                <div className="font-display text-sm font-semibold text-text mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {[
              { title: "Backend Engineer, Platform", co: "Stripe", loc: "Remote — India", score: "8.7" },
              { title: "Software Engineer II", co: "Databricks", loc: "Bengaluru", score: "8.1" },
            ].map((j) => (
              <div key={j.title} className="rounded-lg bg-bg border border-line-soft p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-text leading-snug">{j.title}</div>
                  <span className="shrink-0 font-display text-[11px] font-bold bg-good text-bg rounded px-1.5 py-0.5">
                    {j.score}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted mt-1.5">
                  <span className="flex items-center gap-0.5">
                    <IconBuilding className="text-[10px]" />
                    {j.co}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <IconMapPin className="text-[10px]" />
                    {j.loc}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-accent-soft pt-1">
            <IconSpark className="text-[11px]" />
            Cover note drafted for 3 roles
          </div>
        </div>
      </div>
    </div>
  );
}
