import Link from "next/link";
import { Plus } from "lucide-react";

/** Link to create a new memory album. */
export function CreateMemoryButton() {
  return (
    <Link
      href="/memories/new"
      className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent/30 hover:bg-accent/10"
    >
      <Plus className="size-4 text-accent-deep" aria-hidden />
      Create memory
    </Link>
  );
}
