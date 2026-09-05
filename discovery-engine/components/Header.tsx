import Link from "next/link";

type HeaderProps = {
  productName: string;
  platforms: string[];
  createdAt?: string;
  runId?: string;
  persisted?: boolean;
};

export default function Header({ productName, platforms, createdAt, runId, persisted }: HeaderProps) {
  const initial = productName.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-de-accent text-lg font-bold text-white">
        {initial}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest text-de-text-muted">
          Wishlist → purchase · opportunity discovery
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-de-text-primary">{productName}</h1>
        <p className="mt-1 text-sm text-de-text-secondary">
          Compared against {platforms.filter((p) => p !== productName).join(", ") || "no other platform"}
          {createdAt ? ` · run of ${new Date(createdAt).toLocaleString()}` : ""}
        </p>
        {runId && persisted && (
          <p className="mt-1 text-xs text-de-text-muted">
            Permalink:{" "}
            <Link href={`/run/${runId}`} className="text-de-accent underline underline-offset-2">
              /run/{runId}
            </Link>
          </p>
        )}
      </div>
    </header>
  );
}
