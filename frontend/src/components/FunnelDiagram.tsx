// The real story, drawn as the shape it actually is - not five identical
// icon cards standing in for a process. Widths are illustrative but the
// numbers are the ones quoted throughout this repo's own docs/tests.
// `mix` shades each stage from accent (broad, automatic scanning) toward
// warmth (narrow, the curated result you actually act on) - the funnel's
// own two colors are the brand's two colors, not a decoration on top of it.
const STAGES = [
  { value: "1,500+", label: "postings fetched", detail: "public ATS APIs, every board", width: 100, mix: 100 },
  { value: "~40", label: "pass the free filter", detail: "title, location, freshness — no AI cost", width: 62, mix: 67 },
  { value: "~10", label: "cleared the AI score", detail: "seniority & hard requirements checked", width: 34, mix: 33 },
  { value: "5", label: "land in your inbox", detail: "drafted, ready for you to review", width: 16, mix: 0 },
];

function stageColor(mix: number) {
  return `color-mix(in srgb, var(--color-accent) ${mix}%, var(--color-warmth) ${100 - mix}%)`;
}

export default function FunnelDiagram() {
  return (
    <div className="flex flex-col items-center">
      {STAGES.map((s, i) => {
        const color = stageColor(s.mix);
        return (
          <div key={s.label} className="w-full flex flex-col items-center">
            <div
              className="relative flex items-center justify-center rounded-xl border transition-all"
              style={{
                width: `${s.width}%`,
                minWidth: "11rem",
                borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                background: `linear-gradient(to bottom, color-mix(in srgb, ${color} 16%, transparent), color-mix(in srgb, ${color} 4%, transparent))`,
              }}
            >
              <div className="flex items-baseline gap-2.5 py-3.5">
                <span className="font-display text-xl font-bold tabular-nums" style={{ color: i === STAGES.length - 1 ? color : "var(--color-text)" }}>
                  {s.value}
                </span>
                <span className="text-xs text-muted">{s.label}</span>
              </div>
            </div>
            <div className="text-[11px] text-muted/70 mt-1.5 mb-3">{s.detail}</div>
            {i < STAGES.length - 1 && (
              <svg width="16" height="18" viewBox="0 0 16 18" className="-mt-1 mb-1">
                <path
                  d="M8 0v14M2 10l6 6 6-6"
                  stroke={stageColor((s.mix + STAGES[i + 1].mix) / 2)}
                  strokeOpacity="0.6"
                  strokeWidth="1.75"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
