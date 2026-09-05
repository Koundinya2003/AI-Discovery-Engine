export default function SourceTag({ label, tone = "muted" }: { label: string; tone?: "muted" | "accent" }) {
  return (
    <span
      className={
        tone === "accent"
          ? "inline-block rounded bg-de-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-de-accent"
          : "inline-block rounded bg-de-tag-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-de-text-muted"
      }
    >
      {label}
    </span>
  );
}
