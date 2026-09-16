import type { RunLog, RunStage } from "../lib/types";

const STAGES: { key: keyof RunLog; label: string }[] = [
  { key: "scanned", label: "Scanned" },
  { key: "passed_filters", label: "Passed filters" },
  { key: "candidates", label: "New" },
  { key: "shortlisted", label: "Shortlisted" },
];

// What's actually happening at each stage, in plain language - this is
// what tells a real user "still working," not "stuck," while a run with
// real AI calls can easily take 30-60+ seconds.
export const STAGE_MESSAGE: Record<RunStage, (run: RunLog) => string> = {
  starting: () => "Starting up…",
  fetching: () => "Fetching postings from your selected companies…",
  filtering: (r) => `Filtering ${r.scanned || "the"} postings by title, location and freshness…`,
  screening: (r) =>
    r.candidates > 0
      ? `Scoring ${r.candidates} new posting${r.candidates === 1 ? "" : "s"} with AI — this is the slow part, can take a while…`
      : "Scoring new postings with AI…",
  drafting: () => "Writing application kits for your shortlist (cover note, tailored bullets, gaps)…",
  finishing: () => "Wrapping up…",
  done: () => "Done.",
  failed: () => "This run failed.",
};

export default function FunnelStats({ run }: { run: RunLog }) {
  const max = Math.max(run.scanned, 1);
  const isRunning = run.status === "running";

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-sm font-semibold text-text">Last run funnel</div>
        <div className="text-xs text-muted">
          {run.finished_at ? new Date(run.finished_at).toLocaleString() : isRunning ? "in progress" : ""}
        </div>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 mb-4 mt-2 text-sm text-accent-soft">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          {STAGE_MESSAGE[run.stage]?.(run) ?? "Working…"}
        </div>
      )}

      <div className="space-y-3 mt-4">
        {STAGES.map((stage, i) => {
          const value = Number(run[stage.key] ?? 0);
          const pct = Math.max((value / max) * 100, value > 0 ? 4 : 0);
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs text-muted">{stage.label}</div>
              <div className="flex-1 h-6 rounded-md bg-bg overflow-hidden">
                <div
                  className="h-full rounded-md bg-gradient-to-r from-accent-dim to-accent transition-all duration-500"
                  style={{ width: `${pct}%`, opacity: 1 - i * 0.12 }}
                />
              </div>
              <div className="w-10 text-right text-sm font-display font-semibold text-text tabular-nums">
                {value}
              </div>
            </div>
          );
        })}
      </div>

      {run.status === "failed" && run.error && (
        <div className="mt-4 text-xs text-bad bg-bad/10 border border-bad/20 rounded-lg px-3 py-2">
          {run.error}
        </div>
      )}
    </div>
  );
}
