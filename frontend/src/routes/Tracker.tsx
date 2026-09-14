import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import Button from "../components/Button";
import CompanyAvatar from "../components/CompanyAvatar";
import EmptyState from "../components/EmptyState";
import ScoreBadge from "../components/ScoreBadge";
import Spinner from "../components/Spinner";
import StatusBadge from "../components/StatusBadge";
import { IconDownload } from "../components/icons";
import * as api from "../lib/api";
import { downloadTrackerCsv } from "../lib/api";
import type { JobStatus } from "../lib/types";

const TABS: { key: JobStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
  { key: "dismissed", label: "Dismissed" },
];

const STATUS_COLORS: Record<string, string> = {
  Shortlisted: "#4c56e0",
  Applied: "#15803d",
  Interviewing: "#8b5cf6",
  Offer: "#15803d",
  Rejected: "#dc2626",
  Dismissed: "#dc2626",
};

export default function Tracker() {
  const [tab, setTab] = useState<JobStatus | "all">("all");
  const [downloading, setDownloading] = useState(false);

  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: api.fetchStats });
  const jobsQuery = useQuery({
    queryKey: ["jobs", tab],
    queryFn: () => api.fetchJobs(tab === "all" ? undefined : tab),
  });

  const chartData = statsQuery.data
    ? [
        { name: "Shortlisted", value: statsQuery.data.shortlisted },
        { name: "Applied", value: statsQuery.data.applied },
        { name: "Interviewing", value: statsQuery.data.interviewing },
        { name: "Offer", value: statsQuery.data.offer },
        { name: "Rejected", value: statsQuery.data.rejected },
        { name: "Dismissed", value: statsQuery.data.dismissed },
      ].filter((d) => d.value > 0)
    : [];

  async function handleExport() {
    setDownloading(true);
    try {
      await downloadTrackerCsv();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Application tracker</h1>
          <p className="text-muted text-sm mt-1">
            Every job you've been shown, in one place — this replaces the CLI's seen.json.
          </p>
        </div>
        <Button variant="secondary" loading={downloading} onClick={handleExport}>
          <IconDownload className="text-[15px]" />
          Export CSV
        </Button>
      </div>

      {statsQuery.data && statsQuery.data.tracked > 0 && (
        <div className="panel p-5">
          <div className="font-display text-sm font-semibold text-text mb-4">Status breakdown</div>
          <ResponsiveContainer width="100%" height={Math.max(chartData.length * 44, 100)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, top: 4, bottom: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line-soft)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "var(--color-text)", fontSize: 12 }}
                width={90}
                axisLine={false}
                tickLine={false}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#4c56e0"} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  style={{ fill: "var(--color-text)", fontSize: 12, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <div className="flex items-center gap-1 mb-4 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {jobsQuery.isLoading ? (
          <Spinner />
        ) : jobsQuery.data && jobsQuery.data.length > 0 ? (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-line-soft">
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsQuery.data.map((job) => (
                    <tr key={job.job_id} className="border-b border-line-soft last:border-0 hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <Link
                          to={`/jobs/${encodeURIComponent(job.job_id)}`}
                          className="flex items-center gap-3 group"
                        >
                          <CompanyAvatar company={job.company} size={32} />
                          <div className="min-w-0">
                            <div className="font-medium text-text group-hover:text-accent truncate">{job.title}</div>
                            <div className="text-xs text-muted mt-0.5 truncate">
                              {[job.company, job.location].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={job.score} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {new Date(job.first_seen_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState title="Nothing tracked yet" body="Run a search from the dashboard to populate your tracker." />
        )}
      </div>
    </div>
  );
}
