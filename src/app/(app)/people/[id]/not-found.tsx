import Link from "next/link";

export default function PersonNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-3xl tracking-tight text-ink">
        Person not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        This person may have been merged or removed, or you don&apos;t have
        access to view them.
      </p>
      <Link
        href="/people"
        className="mt-6 inline-flex rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
      >
        Back to people
      </Link>
    </div>
  );
}
