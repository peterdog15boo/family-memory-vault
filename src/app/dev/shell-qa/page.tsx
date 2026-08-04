"use client";

import { useEffect, useMemo, useState } from "react";

const PAGES = [
  "dashboard",
  "media",
  "memories",
  "people",
  "movies",
  "assistant",
  "documents",
  "settings",
] as const;

type Check = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

type FrameResult = {
  page: string;
  theme: string | null;
  vw: number;
  failed: number;
  checks: Check[];
  mode: "desktop" | "mobile";
};

/**
 * Development shell QA runner: desktop + mobile iframes so CSS breakpoints apply.
 */
export default function ShellQaRunnerPage() {
  const [theme, setTheme] = useState<"modern" | "original">("modern");
  const [page, setPage] = useState<(typeof PAGES)[number]>("dashboard");
  const [desktop, setDesktop] = useState<FrameResult | null>(null);
  const [mobile, setMobile] = useState<FrameResult | null>(null);
  const [matrix, setMatrix] = useState<
    { page: string; desktopFailed: number; mobileFailed: number }[]
  >([]);
  const [running, setRunning] = useState(false);

  const desktopSrc = useMemo(
    () => `/dev/shell-qa/embed?theme=${theme}&page=${page}&v=${theme}-${page}-d`,
    [theme, page],
  );
  const mobileSrc = useMemo(
    () => `/dev/shell-qa/embed?theme=${theme}&page=${page}&v=${theme}-${page}-m`,
    [theme, page],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as FrameResult & { type?: string };
      if (!data || data.type !== "fmv-shell-qa") return;
      const withMode = data as FrameResult;
      // Infer mode from source frame width via checks vw
      if (data.vw >= 1024) {
        setDesktop({ ...withMode, mode: "desktop" });
      } else {
        setMobile({ ...withMode, mode: "mobile" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    let cancelled = false;

    async function runMatrix() {
      setRunning(true);
      const rows: { page: string; desktopFailed: number; mobileFailed: number }[] =
        [];
      for (const p of PAGES) {
        if (cancelled) return;
        setPage(p);
        setDesktop(null);
        setMobile(null);
        // Wait for both frames to report
        await new Promise<void>((resolve) => {
          const started = Date.now();
          const tick = () => {
            if (cancelled) return resolve();
            // read latest via closure is stale — poll DOM attrs instead
            const desk = document.querySelector(
              'iframe[data-qa-frame="desktop"]',
            ) as HTMLIFrameElement | null;
            const mob = document.querySelector(
              'iframe[data-qa-frame="mobile"]',
            ) as HTMLIFrameElement | null;
            try {
              const d = desk?.contentDocument?.documentElement.getAttribute(
                "data-shell-qa-result",
              );
              const m = mob?.contentDocument?.documentElement.getAttribute(
                "data-shell-qa-result",
              );
              if (d && m) {
                const dj = JSON.parse(d) as FrameResult;
                const mj = JSON.parse(m) as FrameResult;
                if (dj.page === p && mj.page === p) {
                  rows.push({
                    page: p,
                    desktopFailed: dj.failed,
                    mobileFailed: mj.failed,
                  });
                  setDesktop({ ...dj, mode: "desktop" });
                  setMobile({ ...mj, mode: "mobile" });
                  return resolve();
                }
              }
            } catch {
              // cross-origin shouldn't happen on localhost same origin
            }
            if (Date.now() - started > 4000) {
              rows.push({ page: p, desktopFailed: -1, mobileFailed: -1 });
              return resolve();
            }
            window.setTimeout(tick, 120);
          };
          window.setTimeout(tick, 200);
        });
      }
      if (!cancelled) {
        setMatrix(rows);
        setRunning(false);
        setPage("dashboard");
        document.documentElement.setAttribute(
          "data-shell-qa-matrix",
          JSON.stringify(rows),
        );
      }
    }

    void runMatrix();
    return () => {
      cancelled = true;
    };
  }, [theme]);

  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Shell QA is development-only.</main>;
  }

  const deskFail = desktop?.failed ?? null;
  const mobFail = mobile?.failed ?? null;

  return (
    <div className="min-h-full bg-[#f4f1ec] p-4 text-[#2a2623]">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-serif text-2xl">Shell QA</h1>
          <p className="text-sm opacity-70">
            Full-bleed header/footer + hero portal checks
          </p>
        </div>
        <label className="text-sm">
          Theme{" "}
          <select
            className="rounded border px-2 py-1"
            value={theme}
            onChange={(e) =>
              setTheme(e.target.value === "original" ? "original" : "modern")
            }
            data-shell-qa-theme
          >
            <option value="modern">Modern</option>
            <option value="original">Original</option>
          </select>
        </label>
        <span className="text-sm opacity-70" data-shell-qa-running>
          {running ? "Running matrix…" : "Matrix ready"}
        </span>
      </header>

      <div className="mb-4 flex flex-wrap gap-4 overflow-x-auto pb-2">
        <div className="shrink-0" style={{ width: 1280 }}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Desktop 1280
          </p>
          <iframe
            title="Desktop shell QA"
            data-qa-frame="desktop"
            src={desktopSrc}
            className="h-[720px] w-[1280px] rounded-lg border border-black/10 bg-white"
          />
        </div>
        <div className="shrink-0" style={{ width: 390 }}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
            Mobile 390
          </p>
          <iframe
            title="Mobile shell QA"
            data-qa-frame="mobile"
            src={mobileSrc}
            className="h-[720px] w-[390px] rounded-lg border border-black/10 bg-white"
          />
        </div>
      </div>

      <section
        className="rounded-xl border border-black/10 bg-white/90 p-4 text-sm"
        data-shell-qa-panel
      >
        <div className="mb-3 flex flex-wrap gap-4">
          <p>
            Desktop:{" "}
            <strong
              className={deskFail === 0 ? "text-emerald-700" : "text-red-700"}
              data-desktop-summary
            >
              {deskFail == null
                ? "…"
                : deskFail === 0
                  ? "ALL PASS"
                  : `${deskFail} FAIL`}
            </strong>
          </p>
          <p>
            Mobile:{" "}
            <strong
              className={mobFail === 0 ? "text-emerald-700" : "text-red-700"}
              data-mobile-summary
            >
              {mobFail == null
                ? "…"
                : mobFail === 0
                  ? "ALL PASS"
                  : `${mobFail} FAIL`}
            </strong>
          </p>
        </div>

        {matrix.length > 0 ? (
          <ul className="space-y-1" data-shell-qa-matrix-view>
            {matrix.map((row) => (
              <li
                key={row.page}
                data-matrix-page={row.page}
                data-desktop-failed={row.desktopFailed}
                data-mobile-failed={row.mobileFailed}
              >
                <span className="inline-block w-28 font-medium">{row.page}</span>
                <span
                  className={
                    row.desktopFailed === 0
                      ? "text-emerald-700"
                      : "text-red-700"
                  }
                >
                  desk {row.desktopFailed === 0 ? "PASS" : `${row.desktopFailed} FAIL`}
                </span>
                {" · "}
                <span
                  className={
                    row.mobileFailed === 0 ? "text-emerald-700" : "text-red-700"
                  }
                >
                  mob {row.mobileFailed === 0 ? "PASS" : `${row.mobileFailed} FAIL`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {desktop ? (
          <details className="mt-3">
            <summary>Current desktop checks</summary>
            <ul className="mt-1 space-y-1 text-xs">
              {desktop.checks.map((c) => (
                <li key={c.id}>
                  {c.pass ? "PASS" : "FAIL"} {c.label} — {c.detail}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {mobile ? (
          <details className="mt-2">
            <summary>Current mobile checks</summary>
            <ul className="mt-1 space-y-1 text-xs">
              {mobile.checks.map((c) => (
                <li key={c.id}>
                  {c.pass ? "PASS" : "FAIL"} {c.label} — {c.detail}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
