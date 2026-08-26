import Link from "next/link";
import { GitFork, HeartHandshake, Sparkles, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type FamilyTreeEmptyProps = {
  peopleCount: number;
  className?: string;
};

/**
 * Friendly starter state for Family Tree — warm, not a dry genealogy database.
 */
export function FamilyTreeEmpty({
  peopleCount,
  className,
}: FamilyTreeEmptyProps) {
  const hasPeople = peopleCount > 0;

  return (
    <section
      className={cn("family-tree-empty", className)}
      aria-labelledby="family-tree-empty-title"
    >
      <div className="family-tree-empty-art" aria-hidden>
        <span className="family-tree-empty-node family-tree-empty-node--root">
          <HeartHandshake className="size-5" />
        </span>
        <span className="family-tree-empty-branch family-tree-empty-branch--left" />
        <span className="family-tree-empty-branch family-tree-empty-branch--right" />
        <span className="family-tree-empty-node family-tree-empty-node--a">
          <Users className="size-4" />
        </span>
        <span className="family-tree-empty-node family-tree-empty-node--b">
          <Sparkles className="size-4" />
        </span>
        <span className="family-tree-empty-node family-tree-empty-node--c">
          <GitFork className="size-4" />
        </span>
      </div>

      <h2
        id="family-tree-empty-title"
        className="mt-8 font-display text-2xl tracking-tight text-ink sm:text-3xl"
      >
        {hasPeople
          ? "Your tree is ready to grow"
          : "Plant the first branch"}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-muted sm:text-[0.9875rem]">
        {hasPeople
          ? `You’ve already gathered ${peopleCount} ${
              peopleCount === 1 ? "person" : "people"
            } in your vault. Use the tools below to place them on the tree, add relatives by name, and connect how they’re related.`
          : "Start below by adding a name (even without a photo), or upload photos first so faces can gather in People — then place them here."}
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        {hasPeople ? (
          <Link href="/upload" className="ui-btn ui-btn-secondary ui-btn-lg">
            <Upload className="size-4" aria-hidden />
            Add more photos
          </Link>
        ) : (
          <>
            <Link href="/upload" className="ui-btn ui-btn-primary ui-btn-lg">
              <Upload className="size-4" aria-hidden />
              Add your first photos
            </Link>
            <Link href="/people" className="ui-btn ui-btn-secondary ui-btn-lg">
              <Users className="size-4" aria-hidden />
              Go to People
            </Link>
          </>
        )}
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        <Link
          href="/family"
          className="font-medium text-accent-deep underline-offset-2 hover:underline"
        >
          Ask family to help complete the tree
        </Link>
        {" — "}
        shared photos can land in your People; faces stay private to each
        account.
      </p>
    </section>
  );
}
