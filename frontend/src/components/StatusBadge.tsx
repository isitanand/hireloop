import type { JobStatus } from "../lib/types";

const LABEL: Record<JobStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  dismissed: "Dismissed",
};

const STYLE: Record<JobStatus, string> = {
  new: "bg-line/70 text-muted",
  shortlisted: "bg-accent/15 text-accent-soft",
  applied: "bg-good/15 text-good",
  interviewing: "tint-purple",
  offer: "tint-green",
  rejected: "bg-bad/10 text-bad",
  dismissed: "bg-bad/10 text-bad",
};

const DOT: Record<JobStatus, string> = {
  new: "bg-muted",
  shortlisted: "bg-accent",
  applied: "bg-good",
  interviewing: "bg-[#8b5cf6]",
  offer: "bg-good",
  rejected: "bg-bad",
  dismissed: "bg-bad",
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {LABEL[status]}
    </span>
  );
}
