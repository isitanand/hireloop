// The HireLoop mark: two loops meeting - the search feeding the tracker,
// the tracker feeding the next search. Same geometry everywhere it appears;
// only the stroke color changes so it can sit on a gradient badge or stand
// alone on a plain surface.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9.5" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="14.5" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

// The gradient-square badge used wherever the wordmark also appears
// (sidebar, auth pages, landing header) - one place to keep that lockup
// consistent instead of re-implementing the same span/gradient in each.
export function LogoBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        className ??
        "h-8 w-8 rounded-[10px] bg-gradient-to-br from-accent to-warmth text-bg flex items-center justify-center shrink-0 shadow-[0_0_20px_-4px_var(--color-accent)]"
      }
    >
      <LogoMark className="h-[18px] w-[18px]" />
    </span>
  );
}
