import Link from "next/link";

export default function MemoryNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-3xl tracking-tight text-ink">
        Memory not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        This memory may have been removed, or you don’t have access to view it.
      </p>
      <Link
        href="/memories"
        className="mt-6 inline-flex rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
      >
        Back to memories
      </Link>
    </div>
  );
}
