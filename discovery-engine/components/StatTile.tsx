type StatTileProps = {
  value: string | number;
  caption: string;
  /** Small line under the caption, e.g. a breakdown or a share. */
  sub?: string;
  tone?: "default" | "warn" | "good";
};

const TONE_COLOR: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "var(--de-accent)",
  warn: "#e5a33f",
  good: "#3fbf7f",
};

export default function StatTile({ value, caption, sub, tone = "default" }: StatTileProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-de-border bg-de-surface px-5 pt-4 pb-4">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: TONE_COLOR[tone] }} />
      <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-de-text-primary">{value}</div>
      <div className="mt-1 text-xs text-de-text-muted">{caption}</div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-de-text-secondary">{sub}</div>}
    </div>
  );
}
