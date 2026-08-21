export default function SourceTag({ label }: { label: string }) {
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-de-text-muted bg-de-tag-bg">
      {label}
    </span>
  );
}
