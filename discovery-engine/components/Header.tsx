type HeaderProps = {
  productName: string;
  totalItems: number;
  sourceBreakdown: string; // e.g. "128 Play Store, 96 App Store, and 54 forum discussions"
};

export default function Header({ productName, totalItems, sourceBreakdown }: HeaderProps) {
  const initial = productName.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-de-accent text-lg font-bold text-white">
        {initial}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-de-text-muted">{productName} · Growth Insights</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-de-text-primary">{productName} Discovery Engine</h1>
        <p className="mt-1 text-sm text-de-text-secondary">
          AI-classified themes from {totalItems.toLocaleString()} {sourceBreakdown}
        </p>
      </div>
    </header>
  );
}
