/**
 * In-flight critical work (uploads, movie renders).
 * Idle logout warns and briefly defers, then still forces sign-out if ignored.
 */

export type CriticalWorkKind = "upload" | "movie_render";

export type CriticalWorkSnapshot = {
  uploads: number;
  movieRenders: number;
  total: number;
};

type Listener = (snapshot: CriticalWorkSnapshot) => void;

let uploads = 0;
let movieRenders = 0;
const listeners = new Set<Listener>();

function snapshot(): CriticalWorkSnapshot {
  return {
    uploads,
    movieRenders,
    total: uploads + movieRenders,
  };
}

function notify() {
  const next = snapshot();
  for (const listener of listeners) {
    try {
      listener(next);
    } catch {
      // ignore subscriber errors
    }
  }
}

/** Increment a critical-work counter; returns end() that must be called once. */
export function beginCriticalWork(kind: CriticalWorkKind): () => void {
  let ended = false;
  if (kind === "upload") uploads += 1;
  else movieRenders += 1;
  notify();
  return () => {
    if (ended) return;
    ended = true;
    if (kind === "upload") uploads = Math.max(0, uploads - 1);
    else movieRenders = Math.max(0, movieRenders - 1);
    notify();
  };
}

export function getCriticalWorkSnapshot(): CriticalWorkSnapshot {
  return snapshot();
}

export function getActiveCriticalWorkCount(): number {
  return uploads + movieRenders;
}

export function subscribeCriticalWork(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — do not use in product code. */
export function __resetCriticalWorkForTests() {
  uploads = 0;
  movieRenders = 0;
  listeners.clear();
}
