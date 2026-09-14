import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import StatusDonut from "../components/StatusDonut";
import { IconBuilding, IconCheck, IconChart, IconSpark } from "../components/icons";
import * as api from "../lib/api";

export default function Analytics() {
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: api.fetchStats });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.fetchRuns });

  const stats = statsQuery.data;
  const applied = stats?.applied ?? 0;
  const interviewing = stats?.interviewing ?? 0;
  const offer = stats?.offer ?? 0;
  const rejected = stats?.rejected ?? 0;
  const totalApplications = applied + interviewing + offer + rejected;
  const responded = interviewing + offer + rejected;
  const responseRate = totalApplications > 0 ? Math.round((responded / totalApplications) * 100) : 0;

  const donutSlices = [
    { name: "Applied", value: applied, color: "#4c56e0" },
    { name: "Interviewing", value: interviewing, color: "#8b5cf6" },
    { name: "Offer", value: offer, color: "#15803d" },
    { name: "Rejected", value: rejected, color: "#dc2626" },
  ];

  const doneRuns = (runsQuery.data ?? []).filter((r) => r.status === "done").slice(0, 10).reverse();
  // Same-day reruns are common (testing a filter change, retrying after a
  // failed batch) and used to render as identical, indistinguishable "9
  // Sept" labels on the axis - only add the time once a date repeats, so a
  // single run a day still reads as a clean date and a busier day is still
  // legible instead of every label growing a timestamp it doesn't need.
  const dateCounts = new Map<string, number>();
  for (const r of doneRuns) {
    const d = new Date(r.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
  }
  const runData = doneRuns.map((r) => {
    const started = new Date(r.started_at);
    const dateLabel = started.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const name =
      (dateCounts.get(dateLabel) ?? 0) > 1
        ? `${dateLabel}, ${started.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
        : dateLabel;
    return { name, "Passed filter": r.passed_filters, Shortlisted: r.shortlisted };
  });

  if (statsQuery.isLoading || runsQuery.isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text">Analytics</h1>
        <p className="text-muted text-sm mt-1">How your search is actually going.</p>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard label="Applications" value={totalApplications} icon={IconBuilding} tint="tint-blue" />
        <StatCard label="Interviewing" value={interviewing} icon={IconSpark} tint="tint-purple" />
        <StatCard label="Offers" value={offer} icon={IconCheck} tint="tint-green" />
        <StatCard label="Response rate" value={`${responseRate}%`} icon={IconChart} tint="tint-orange" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-stretch">
        <div className="panel p-5 h-full flex flex-col">
          <div className="font-display text-sm font-semibold text-text mb-4">Search funnel, last 10 runs</div>
          {runData.length === 0 ? (
            <div className="flex-1 min-h-[260px] flex items-center justify-center">
              <p className="text-sm text-muted">Run a search to see this fill in.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minHeight={260} className="flex-1">
              <BarChart data={runData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line-soft)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 10,
                    boxShadow: "0 12px 24px -12px rgba(0,0,0,0.25)",
                  }}
                  labelStyle={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 4 }}
                  cursor={false}
                />
                <Legend wrapperStyle={{ color: "var(--color-muted)", fontSize: 12 }} />
                <Bar
                  dataKey="Passed filter"
                  fill="#4c56e0"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                  activeBar={{ fillOpacity: 0.85 }}
                />
                <Bar
                  dataKey="Shortlisted"
                  fill="#15803d"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                  activeBar={{ fillOpacity: 0.85 }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <StatusDonut title="Applications by stage" slices={donutSlices} />
      </div>
    </div>
  );
}
