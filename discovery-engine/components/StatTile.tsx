type StatTileProps = {
  value: string | number;
  caption: string;
  accentColor?: string;
  error?: string;
};

export default function StatTile({ value, caption, accentColor = "var(--de-accent)", error }: StatTileProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-de-border bg-de-surface px-5 pt-4 pb-4">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: error ? "#e5573f" : accentColor }} />
      <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-de-text-primary">{value}</div>
      <div className="mt-1 text-xs text-de-text-muted">{caption}</div>
      {error && <div className="mt-1 text-xs text-[#e5573f]">error</div>}
    </div>
  );
}
