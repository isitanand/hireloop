import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export default function StatusDonut({ title, slices }: { title: string; slices: DonutSlice[] }) {
  const data = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="panel p-5 h-full flex flex-col">
      <div className="font-display text-sm font-semibold text-text mb-1">{title}</div>
      {total === 0 ? (
        <div className="flex-1 min-h-[220px] flex items-center justify-center text-sm text-muted">
          Nothing tracked yet.
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={3}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                >
                  {data.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 10,
                    boxShadow: "0 12px 24px -12px rgba(0,0,0,0.25)",
                    fontSize: 13,
                  }}
                  labelStyle={{ color: "var(--color-text)", fontWeight: 600 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-2xl font-bold text-text tabular-nums">{total}</div>
              <div className="text-[11px] text-muted">Total</div>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-2.5">
            {data.map((s) => {
              const pct = Math.round((s.value / total) * 100);
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0 text-text">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="text-xs text-muted tabular-nums shrink-0">
                      <span className="text-text font-semibold">{s.value}</span> · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-line-soft mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
