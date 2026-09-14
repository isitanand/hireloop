import { Link } from "react-router-dom";
import type { UserJob } from "../lib/types";
import CompanyAvatar from "./CompanyAvatar";
import { IconMapPin } from "./icons";
import ScoreBadge from "./ScoreBadge";
import StatusBadge from "./StatusBadge";

export default function JobCard({ job }: { job: UserJob }) {
  return (
    <Link
      to={`/jobs/${encodeURIComponent(job.job_id)}`}
      className="panel block p-5 hover:border-accent/40 hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start gap-3">
        <CompanyAvatar company={job.company} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display font-semibold text-text truncate">{job.title}</div>
              <div className="flex items-center gap-2.5 text-xs text-muted mt-1">
                <span className="truncate">{job.company}</span>
                {job.location && (
                  <span className="flex items-center gap-1 shrink-0">
                    <IconMapPin className="text-[12px]" />
                    {job.location}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <ScoreBadge score={job.score} />
            </div>
          </div>
        </div>
      </div>
      {job.reason ? (
        <p className="text-sm text-muted mt-3.5 line-clamp-2 leading-relaxed">{job.reason}</p>
      ) : job.score == null ? (
        <p className="text-sm text-muted/70 mt-3.5 italic">Not screened yet — will retry on your next run.</p>
      ) : null}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-line-soft">
        <StatusBadge status={job.status} />
        <span className="text-xs text-muted">
          {new Date(job.first_seen_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
    </Link>
  );
}
