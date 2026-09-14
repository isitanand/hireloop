import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RunLog } from "../lib/types";

export default function ActivityChart({ runs }: { runs: RunLog[] }) {
  // One point per calendar day, not per run - jobhunt is meant to run once a
  // day (the cron), so a burst of manual reruns while testing used to plot
  // as several near-identical points collapsing to zero on the same date,
  // which read as noise rather than a trend. `runs` comes newest-first, so
  // the first run seen for a given day is already that day's most recent -
  // exactly the one worth keeping to represent where the day ended up.
  const doneRuns = runs.filter((r) => r.status === "done");
  const seenDays = new Set<string>();
  const perDay: RunLog[] = [];
  for (const r of doneRuns) {
    const dayKey = new Date(r.started_at).toDateString();
    if (seenDays.has(dayKey)) continue;
    seenDays.add(dayKey);
    perDay.push(r);
  }

  const data = perDay
    .slice(0, 10)
    .reverse()
    .map((r) => ({
      name: new Date(r.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      Shortlisted: r.shortlisted,
      Candidates: r.candidates,
    }));

  return (
    <div className="panel p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-sm font-semibold text-text">Search activity</div>
        <div className="text-xs text-muted">last {data.length} day{data.length === 1 ? "" : "s"}</div>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 min-h-[220px] flex items-center justify-center text-sm text-muted">
          Run a search to start filling this in.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%" minHeight={220} className="flex-1">
          <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="shortlistedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#15803d" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#15803d" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="candidatesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4c56e0" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#4c56e0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line-soft)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-line)", borderRadius: 10 }}
              labelStyle={{ color: "var(--color-text)" }}
            />
            <Area type="monotone" dataKey="Candidates" stroke="#4c56e0" strokeWidth={2} fill="url(#candidatesFill)" />
            <Area type="monotone" dataKey="Shortlisted" stroke="#15803d" strokeWidth={2} fill="url(#shortlistedFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
