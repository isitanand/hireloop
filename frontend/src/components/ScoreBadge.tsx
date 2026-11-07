// Mirrors jobhunt/digest.py's _badge() thresholds so the email and the
// dashboard agree on what "good" looks like.
export default function ScoreBadge({ score }: { score: number | null }) {
  // null means the AI never got to this one (e.g. a busy-provider error
  // skipped its batch) - it's queued for another attempt next run, not an
  // actual score of zero. Showing "0.0" for that would look like a real,
  // deliberately low AI verdict instead of "not screened yet".
  if (score == null) {
    return (
      <span
        className="font-display inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold border border-dashed border-line text-muted"
        title="Not screened yet - will retry on your next run"
      >
        Pending
      </span>
    );
  }
  const classes =
    score >= 8.5 ? "bg-good text-bg" : score >= 7 ? "bg-warn text-bg" : "bg-line text-muted";
  return (
    <span
      className={`font-display inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${classes}`}
      title="AI fit score, out of 10"
    >
      {score.toFixed(1)}
    </span>
  );
}
