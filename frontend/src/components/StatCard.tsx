export default function StatCard({
  label,
  value,
  icon: Icon,
  tint,
  sub,
}: {
  label: string;
  value: number | string | undefined;
  icon: (props: { className?: string }) => React.ReactElement;
  tint: string;
  sub?: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-muted">{label}</div>
        <div className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-base ${tint}`}>
          <Icon className="text-[19px]" />
        </div>
      </div>
      <div className="font-display text-3xl font-bold text-text mt-3 tabular-nums">{value ?? "—"}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
