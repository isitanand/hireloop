// A deterministic colored initial tile per company - same company always
// gets the same color, so the eye can scan a list of cards the way it would
// scan real logos, without us needing to source or store actual logo assets.
const PALETTE = [
  "#4c56e0", "#15803d", "#b45309", "#8b5cf6", "#dc2626", "#0891b2", "#c026d3", "#65a30d",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function CompanyAvatar({ company, size = 40 }: { company: string; size?: number }) {
  const initial = (company.trim()[0] || "?").toUpperCase();
  const color = colorFor(company);
  return (
    <div
      className="shrink-0 rounded-xl flex items-center justify-center font-display font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
