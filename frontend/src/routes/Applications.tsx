import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import EmptyState from "../components/EmptyState";
import JobCard from "../components/JobCard";
import Spinner from "../components/Spinner";
import * as api from "../lib/api";
import type { JobStatus } from "../lib/types";

const STAGES: { key: JobStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
];

// Applications you've actually acted on - a focused view of roles you
// applied to (whether the AI found them or you added them yourself) and
// where each stands, separate from Dashboard's broader "here's what the AI
// found today" discovery feed and Tracker's complete unfiltered history.
const APPLICATION_STATUSES: JobStatus[] = ["applied", "interviewing", "offer", "rejected"];

export default function Applications() {
  const [stage, setStage] = useState<JobStatus | "all">("all");

  const jobsQuery = useQuery({
    queryKey: ["jobs", "applications", stage],
    queryFn: async () => {
      if (stage !== "all") return api.fetchJobs(stage);
      const lists = await Promise.all(APPLICATION_STATUSES.map((s) => api.fetchJobs(s)));
      return lists.flat().sort((a, b) => (a.applied_at ?? a.first_seen_at) < (b.applied_at ?? b.first_seen_at) ? 1 : -1);
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text">Applications</h1>
        <p className="text-muted text-sm mt-1">Roles you've applied to and where each one stands.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-line overflow-x-auto">
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStage(s.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              stage === s.key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {jobsQuery.isLoading ? (
        <Spinner />
      ) : jobsQuery.data && jobsQuery.data.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobsQuery.data.map((job) => (
            <JobCard key={job.job_id} job={job} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing here yet"
          body="Mark a job as applied from its detail page, or add one you found yourself with 'Add application'."
        />
      )}
    </div>
  );
}
