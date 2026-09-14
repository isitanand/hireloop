import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/Button";
import CompanyAvatar from "../components/CompanyAvatar";
import { IconArrowRight, IconMapPin, IconSpark } from "../components/icons";
import ScoreBadge from "../components/ScoreBadge";
import Spinner from "../components/Spinner";
import StatusBadge from "../components/StatusBadge";
import * as api from "../lib/api";
import { errorMessage } from "../lib/api";
import type { JobStatus } from "../lib/types";

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "dismissed", label: "Dismissed" },
];

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const queryClient = useQueryClient();
  const [coverNote, setCoverNote] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.fetchJob(jobId!),
    enabled: Boolean(jobId),
  });

  useEffect(() => {
    if (job?.draft.cover_note) setCoverNote(job.draft.cover_note);
  }, [job?.draft.cover_note]);

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.updateJobStatus(jobId!, status),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["job", jobId], updated);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const draftMutation = useMutation({
    mutationFn: () => api.generateDraft(jobId!),
    onSuccess: (updated) => {
      queryClient.setQueryData(["job", jobId], updated);
    },
  });

  if (isLoading) return <Spinner />;
  if (!job) return <div className="text-muted">Job not found.</div>;

  const draft = job.draft;
  const hasKit = Boolean(draft.fit_summary || (draft.tailored_bullets && draft.tailored_bullets.length > 0));

  async function copyCoverNote() {
    await navigator.clipboard.writeText(coverNote);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <IconArrowRight className="rotate-180 text-[15px]" />
        Back to dashboard
      </Link>

      <div className="panel p-6">
        <div className="flex items-start gap-4">
          <CompanyAvatar company={job.company} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-xl font-semibold text-text">{job.title}</h1>
                <div className="flex items-center gap-3 text-sm text-muted mt-1.5">
                  <span>{job.company}</span>
                  {job.location && (
                    <span className="flex items-center gap-1">
                      <IconMapPin className="text-[13px]" />
                      {job.location}
                    </span>
                  )}
                </div>
              </div>
              <ScoreBadge score={job.score} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <StatusBadge status={job.status} />
          {job.reason ? (
            <span className="text-sm text-muted">{job.reason}</span>
          ) : job.score == null ? (
            <span className="text-sm text-muted italic">Not screened yet — will retry on your next run.</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer">
              <Button>
                Open posting &amp; apply
                <IconArrowRight className="text-[15px]" />
              </Button>
            </a>
          )}
          <select
            className="input w-auto"
            value={job.status}
            disabled={statusMutation.isPending}
            onChange={(e) => statusMutation.mutate(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {!hasKit && (
          <div className="mt-5 pt-5 border-t border-line-soft">
            <p className="text-sm text-muted mb-3">
              No application kit yet — {job.job_id.startsWith("manual:")
                ? "this role was added by hand, so it never went through AI screening."
                : "it scored below the AI drafting stage, or hasn't been screened yet."}
            </p>
            <Button
              variant="secondary"
              loading={draftMutation.isPending}
              onClick={() => draftMutation.mutate()}
            >
              <IconSpark className="text-[15px]" />
              Generate application kit
            </Button>
            {draftMutation.isError && (
              <p className="text-sm text-bad mt-2">
                {errorMessage(draftMutation.error, "Could not generate a kit for this job")}
              </p>
            )}
          </div>
        )}
      </div>

      {hasKit && (
        <div className="panel p-6 space-y-5">
          {draft.fit_summary && (
            <div>
              <SubHeading>Why it fits</SubHeading>
              <p className="text-sm text-text leading-relaxed mt-2">{draft.fit_summary}</p>
            </div>
          )}

          {((draft.tailored_bullets?.length ?? 0) > 0 || (draft.gaps?.length ?? 0) > 0) && (
            <div className="grid sm:grid-cols-2 gap-5 pt-1">
              {draft.tailored_bullets && draft.tailored_bullets.length > 0 && (
                <div>
                  <SubHeading>Resume bullets for this role</SubHeading>
                  <ul className="list-disc list-inside space-y-1.5 mt-2">
                    {draft.tailored_bullets.map((b, i) => (
                      <li key={i} className="text-sm text-text leading-relaxed">
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {draft.gaps && draft.gaps.length > 0 && (
                <div>
                  <SubHeading>Honest gaps</SubHeading>
                  <ul className="list-disc list-inside space-y-1.5 mt-2">
                    {draft.gaps.map((g, i) => (
                      <li key={i} className="text-sm text-muted leading-relaxed">
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {draft.questions_to_ask && draft.questions_to_ask.length > 0 && (
            <div className="pt-1">
              <SubHeading>Ask them</SubHeading>
              <ul className="list-disc list-inside space-y-1.5 mt-2">
                {draft.questions_to_ask.map((q, i) => (
                  <li key={i} className="text-sm text-text leading-relaxed">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {draft.cover_note && (
        <Section title="Cover note — edit before sending">
          <textarea
            className="input h-40 leading-relaxed"
            value={coverNote}
            onChange={(e) => setCoverNote(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <Button variant="secondary" onClick={copyCoverNote}>
              {copied ? "Copied ✓" : "Copy"}
            </Button>
          </div>
        </Section>
      )}

      <Section title="Full job description">
        <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed">{job.description}</p>
      </Section>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-[0.1em] text-accent-soft">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-6">
      <SubHeading>{title}</SubHeading>
      <div className="mt-3">{children}</div>
    </div>
  );
}
