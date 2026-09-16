import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ActivityChart from "../components/ActivityChart";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import FunnelStats, { STAGE_MESSAGE } from "../components/FunnelStats";
import { IconCheck, IconRun, IconSpark, IconTrack, IconX } from "../components/icons";
import JobCard from "../components/JobCard";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import StatusDonut from "../components/StatusDonut";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { errorMessage } from "../lib/api";
import type { JobStatus } from "../lib/types";

const TABS: { key: JobStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "new", label: "New" },
  { key: "applied", label: "Applied" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<JobStatus | "all">("shortlisted");
  const [runError, setRunError] = useState<string | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: api.fetchProfile, retry: false });
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: api.fetchStats });
  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: api.fetchRuns });
  const filtersQuery = useQuery({ queryKey: ["filters"], queryFn: api.fetchFilters });
  const latestRun = runsQuery.data?.[0];

  // "Tracked: 44" but the tabs above only show 2 is not a bug, but it looks
  // like one unless the gap is explained - most of those 44 are jobs the AI
  // genuinely screened and scored below the user's own minimum, which the
  // tabs correctly hide. Compare the unfiltered vs. threshold-filtered "all"
  // count once so that gap has a number attached to it instead of just
  // looking inconsistent.
  const allJobsQuery = useQuery({ queryKey: ["jobs", "all", false], queryFn: () => api.fetchJobs(undefined, false) });
  const qualifiedAllQuery = useQuery({ queryKey: ["jobs", "all", true], queryFn: () => api.fetchJobs(undefined, true) });
  const belowThresholdCount =
    allJobsQuery.data && qualifiedAllQuery.data
      ? allJobsQuery.data.length - qualifiedAllQuery.data.length
      : undefined;

  // Once a job is marked applied, its score no longer matters - it was a
  // deliberate decision, not a recommendation, so it should always show.
  // Everything else here IS a recommendation, and must respect the minimum
  // score the user set in Settings - a "New" tab full of 2s and 3s when the
  // minimum is 6 defeats the point of the setting.
  const onlyQualified = tab !== "applied";
  const jobsQuery = useQuery({
    queryKey: ["jobs", tab, onlyQualified],
    queryFn: () => api.fetchJobs(tab === "all" ? undefined : tab, onlyQualified),
  });

  // Which run ID is actively being polled right now, if any - guards against
  // starting a second poll loop for the same run (e.g. the resume-on-mount
  // effect firing while the just-started mutation's own poll is already
  // running) and lets the resume effect below tell whether it needs to act.
  const pollingRunId = useRef<number | null>(null);

  const runMutation = useMutation({
    mutationFn: () => api.startRun("llm", false),
    onSuccess: async (run) => {
      setRunError(null);
      setRunNotice(null);
      await pollRun(run.id);
    },
    onError: (err) => setRunError(errorMessage(err, "Could not start the run")),
  });

  // A run keeps going on the server regardless of what the browser does, but
  // polling was only ever started from the button click that kicked it off -
  // refresh the page (or come back to the dashboard later) while a run is
  // still "running" and the funnel/stage display was a static snapshot from
  // page load, showing e.g. "Writing application kits..." forever even long
  // after the run had actually finished. Resume polling for it here instead.
  useEffect(() => {
    if (latestRun?.status === "running" && pollingRunId.current !== latestRun.id) {
      pollRun(latestRun.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRun?.id, latestRun?.status]);

  async function pollRun(runId: number) {
    pollingRunId.current = runId;
    try {
      // A first run (cold job cache, real AI screening + drafting across many
      // candidates) can genuinely take a couple of minutes - 120 x 1.5s = 3
      // minutes before giving up and telling the user to check back later.
      for (let i = 0; i < 120; i++) {
        let run;
        try {
          run = await api.fetchRun(runId);
        } catch (err) {
          // The run this poll loop is chasing is gone (server restarted
          // mid-run, DB reset, etc.) or unreachable - surface that instead of
          // spinning "running..." forever with no way out but a page reload.
          setRunError(errorMessage(err, "Lost track of this run - try running the search again"));
          queryClient.setQueryData(["runs"], (old: typeof runsQuery.data) =>
            old?.map((r) => (r.id === runId ? { ...r, status: "failed" as const } : r)),
          );
          return;
        }
        queryClient.setQueryData(["runs"], (old: typeof runsQuery.data) =>
          old ? [run, ...old.filter((r) => r.id !== run.id)] : [run],
        );
        if (run.status !== "running") {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["jobs"] }),
            queryClient.invalidateQueries({ queryKey: ["stats"] }),
          ]);
          if (run.status === "failed") setRunError(run.error);
          // The shared job cache only refreshes every few hours, so running
          // again soon after just rescans the same cached postings - zero
          // new candidates is the AI correctly finding nothing new, not a
          // stall, but "Shortlisted: 0" on its own reads like a failure.
          setRunNotice(
            run.status === "done" && run.candidates === 0
              ? "No new job postings found since your last scan. The board cache refreshes every few hours - check back later for fresh listings."
              : null,
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setRunError("This run is taking unusually long - it may still finish in the background; refresh in a bit to check.");
    } finally {
      // Let a future run (or a resumed poll for a still-running one on a
      // fresh page load) start its own loop instead of being silently
      // blocked by this one's now-finished run ID.
      if (pollingRunId.current === runId) pollingRunId.current = null;
    }
  }

  const hasProfile = !profileQuery.isError;
  const firstName = user?.name?.split(" ")[0];
  // latestRun is whatever ran last, finished or not - only treat it as the
  // live one when it's actually still going, or a just-finished run's "done"
  // stage would narrate a run that isn't happening.
  const activeRun = latestRun?.status === "running" ? latestRun : null;
  const isRunning = runMutation.isPending || Boolean(activeRun);

  const donutSlices = [
    { name: "Shortlisted", value: statsQuery.data?.shortlisted ?? 0, color: "#4c56e0" },
    { name: "Applied", value: statsQuery.data?.applied ?? 0, color: "#15803d" },
    { name: "Interviewing", value: statsQuery.data?.interviewing ?? 0, color: "#8b5cf6" },
    { name: "Offer", value: statsQuery.data?.offer ?? 0, color: "#15803d" },
    { name: "Dismissed", value: statsQuery.data?.dismissed ?? 0, color: "#dc2626" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Dashboard</h1>
          <p className="text-muted text-sm mt-1">
            {firstName ? `Welcome back, ${firstName}! ` : ""}Here's your job search overview.
          </p>
        </div>
        <Button
          onClick={() => runMutation.mutate()}
          loading={runMutation.isPending || latestRun?.status === "running"}
          disabled={!hasProfile}
        >
          <IconRun className="text-[15px]" />
          Run search now
        </Button>
      </div>

      {!hasProfile && !profileQuery.isLoading && (
        <EmptyState
          title="Set up your profile to get started"
          body="Upload a resume or fill in your profile by hand so the AI has something to score jobs against."
          action={
            <Link to="/onboarding">
              <Button>Set up profile</Button>
            </Link>
          }
        />
      )}

      {runError && (
        <div className="text-sm text-bad bg-bad/10 border border-bad/20 rounded-lg px-4 py-3">
          {runError}
        </div>
      )}

      {runNotice && <p className="text-sm text-accent font-medium">{runNotice}</p>}

      {/* The funnel panel further down already narrates the running stage, but
          it sits below the stat cards and both charts - click "Run search now"
          and the only feedback above the fold was the button's own spinner,
          which reads as "nothing happened" on a run that legitimately takes
          minutes. Say it where the click happened. */}
      {isRunning && (
        <div className="panel p-4 flex items-start gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              Search running — {activeRun
                ? STAGE_MESSAGE[activeRun.stage]?.(activeRun) ?? "Working…"
                : "Starting up…"}
            </p>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              A first scan reads every job board from scratch and scores each posting
              against your resume, so it usually takes a few minutes. It keeps running
              on the server — you can leave this page and come back to it.
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard
          label="Tracked"
          value={statsQuery.data?.tracked}
          icon={IconTrack}
          tint="tint-blue"
          sub={belowThresholdCount ? `${belowThresholdCount} below your min score` : undefined}
        />
        <StatCard label="Shortlisted" value={statsQuery.data?.shortlisted} icon={IconSpark} tint="tint-purple" />
        <StatCard label="Applied" value={statsQuery.data?.applied} icon={IconCheck} tint="tint-green" />
        <StatCard label="Dismissed" value={statsQuery.data?.dismissed} icon={IconX} tint="tint-orange" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-stretch">
        <ActivityChart runs={runsQuery.data ?? []} />
        <StatusDonut title="Where things stand" slices={donutSlices} />
      </div>

      {latestRun && (latestRun.status === "running" || tab === "all") && <FunnelStats run={latestRun} />}

      <div>
        {Boolean(belowThresholdCount) && (
          <p className="text-xs text-muted mb-3">
            {belowThresholdCount} role{belowThresholdCount === 1 ? "" : "s"} scored below your minimum
            of {filtersQuery.data?.score_threshold ?? 6} and {belowThresholdCount === 1 ? "is" : "are"} hidden here —
            they're still saved in your <Link to="/tracker" className="text-accent font-medium">Tracker</Link>.
          </p>
        )}
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobsQuery.data.map((job) => (
              <JobCard key={job.job_id} job={job} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing here yet"
            body={hasProfile ? "Run a search to fetch and score today's postings." : undefined}
          />
        )}
      </div>
    </div>
  );
}
