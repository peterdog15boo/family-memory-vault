import Link from "next/link";

export default function DocumentNotFound() {
  return (
    <div className="documents-vault mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-2xl tracking-tight text-[color:var(--doc-ink,#1c2a30)]">
        Document not found
      </h1>
      <p className="mt-2 text-sm text-[color:var(--doc-muted,#5a6b73)]">
        It may have been deleted, or it isn’t in your private vault.
      </p>
      <Link
        href="/documents"
        className="mt-6 inline-block text-sm font-medium text-[color:var(--doc-accent-deep,#2c4a53)] hover:underline"
      >
        Back to documents
      </Link>
    </div>
  );
}
