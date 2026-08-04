"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import type { PageHeroSlotId } from "@/content/page-hero-media";

const PAGES: { id: string; slot: PageHeroSlotId; title: string }[] = [
  { id: "dashboard", slot: "dashboard", title: "Dashboard" },
  { id: "media", slot: "media", title: "Photos" },
  { id: "memories", slot: "memories", title: "Memories" },
  { id: "people", slot: "people", title: "People" },
  { id: "movies", slot: "movies", title: "Movies" },
  { id: "assistant", slot: "assistant", title: "Ask AI" },
  { id: "documents", slot: "documents", title: "Documents" },
  { id: "settings", slot: "settings", title: "Settings" },
];

type Check = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

function readPageParam(): string {
  if (typeof window === "undefined") return PAGES[0].id;
  return new URLSearchParams(window.location.search).get("page") ?? PAGES[0].id;
}

function measureShell(): Check[] {
  const shell = document.querySelector(".dashboard-shell") as HTMLElement | null;
  const header = document.querySelector(
    ".dashboard-shell-header",
  ) as HTMLElement | null;
  const footer = document.querySelector(".app-footer") as HTMLElement | null;
  const hero = document.querySelector(
    ".dashboard-shell-main .app-page-hero, .dashboard-shell-main .app-intro",
  ) as HTMLElement | null;
  const sidebar = document.querySelector(
    ".dashboard-sidebar",
  ) as HTMLElement | null;
  const main = document.querySelector(
    ".dashboard-shell-main",
  ) as HTMLElement | null;
  const mainChild = document.querySelector(
    ".dashboard-shell-main > .shell-qa-body",
  ) as HTMLElement | null;
  const brand = document.querySelector(
    ".dashboard-shell-brand-cluster, .dashboard-shell-safety",
  ) as HTMLElement | null;

  const vw = document.documentElement.clientWidth;
  const docScrollW = document.documentElement.scrollWidth;
  const next: Check[] = [];
  const push = (id: string, label: string, pass: boolean, detail: string) => {
    next.push({ id, label, pass, detail });
  };

  if (!shell || !header || !main || !sidebar) {
    push("dom", "Shell DOM present", false, "Missing shell landmarks");
    return next;
  }

  const edgeTol = 2;
  const spansViewport = (left: number, right: number) =>
    Math.abs(left) <= edgeTol && Math.abs(right - vw) <= edgeTol;

  const hr = header.getBoundingClientRect();
  const mr = main.getBoundingClientRect();
  const sr = sidebar.getBoundingClientRect();

  push(
    "header-edge",
    "Header edge-to-edge",
    spansViewport(hr.left, hr.right),
    `left=${hr.left.toFixed(1)} right=${hr.right.toFixed(1)} clientWidth=${vw}`,
  );

  if (footer) {
    const fr = footer.getBoundingClientRect();
    push(
      "footer-edge",
      "Footer edge-to-edge",
      spansViewport(fr.left, fr.right),
      `left=${fr.left.toFixed(1)} right=${fr.right.toFixed(1)} clientWidth=${vw}`,
    );
  } else {
    const theme = document.documentElement.getAttribute("data-theme");
    push(
      "footer-edge",
      "Footer edge-to-edge",
      theme === "original",
      theme === "original"
        ? "Original theme correctly omits cinematic footer"
        : "Footer missing in Modern",
    );
  }

  if (hero) {
    const her = hero.getBoundingClientRect();
    const inMain = Boolean(hero.closest(".dashboard-shell-main"));
    push(
      "hero-in-main",
      "Page hero lives in main column",
      inMain && (vw < 1024 || her.left >= sr.left - 2),
      `inMain=${inMain} hero.left=${her.left.toFixed(1)} main.left=${mr.left.toFixed(1)}`,
    );
  } else {
    push(
      "hero-in-main",
      "Page hero lives in main column",
      false,
      "Hero missing",
    );
  }

  if (brand) {
    const br = brand.getBoundingClientRect();
    if (br.width > 1 && br.height > 1) {
      const clipped =
        br.top < hr.top - 1 ||
        br.bottom > hr.bottom + 1 ||
        br.left < hr.left - 1;
      push(
        "header-content",
        "Sidebar does not clip header chrome",
        !clipped,
        `brand top=${br.top.toFixed(1)} header=[${hr.top.toFixed(1)},${hr.bottom.toFixed(1)}]`,
      );
    } else {
      push(
        "header-content",
        "Sidebar does not clip header chrome",
        true,
        "Header toolbar-only (no visible brand cluster at this breakpoint)",
      );
    }
  }

  if (mainChild) {
    const styles = getComputedStyle(mainChild);
    const maxW = styles.maxWidth;
    const passMax =
      maxW !== "none" && maxW !== "0px"
        ? true
        : mainChild.getBoundingClientRect().width <= 960 || vw < 1024;
    push(
      "main-max",
      "Main content constrained",
      passMax,
      `child width=${mainChild.getBoundingClientRect().width.toFixed(0)} maxWidth=${maxW}`,
    );
  }

  const mainStyles = getComputedStyle(main);
  push(
    "main-pad",
    "Main has horizontal padding",
    parseFloat(mainStyles.paddingLeft) >= 12 &&
      parseFloat(mainStyles.paddingRight) >= 12,
    `padding-inline ${mainStyles.paddingLeft} / ${mainStyles.paddingRight}`,
  );

  if (vw >= 1024) {
    const aligned = Math.abs(sr.top - mr.top) <= 4;
    const noGiantGap = sr.top - hr.bottom <= 12;
    push(
      "sidebar-top",
      "Sidebar top-aligned under chrome (no hero gap)",
      aligned && noGiantGap,
      `sidebar.top=${sr.top.toFixed(1)} main.top=${mr.top.toFixed(1)} header.bottom=${hr.bottom.toFixed(1)}`,
    );
  } else {
    const nav = sidebar.querySelector(
      ".dashboard-sidebar-nav, .ui-nav",
    ) as HTMLElement | null;
    const horizontal =
      Boolean(nav) && getComputedStyle(nav!).flexDirection !== "column";
    push(
      "mobile-nav",
      "Mobile nav strip present",
      Boolean(nav) && horizontal,
      nav
        ? `flexDirection=${getComputedStyle(nav).flexDirection} scrollWidth=${nav.scrollWidth}`
        : "nav missing",
    );
  }

  push(
    "no-hscroll",
    "No horizontal page scroll",
    docScrollW <= vw + 1,
    `scrollWidth=${docScrollW} vw=${vw}`,
  );

  return next;
}

/**
 * Embeddable shell surface (no floating QA chrome). Used by the parent
 * harness in desktop + mobile iframes so media queries match the frame.
 */
export default function ShellQaEmbedPage() {
  const [pageId, setPageId] = useState(PAGES[0].id);
  const page = useMemo(
    () => PAGES.find((p) => p.id === pageId) ?? PAGES[0],
    [pageId],
  );

  useEffect(() => {
    setPageId(readPageParam());
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    function report() {
      const checks = measureShell();
      const payload = {
        type: "fmv-shell-qa",
        page: pageId,
        theme: document.documentElement.getAttribute("data-theme"),
        vw: document.documentElement.clientWidth,
        failed: checks.filter((c) => !c.pass).length,
        checks,
      };
      window.parent?.postMessage(payload, "*");
      document.documentElement.setAttribute(
        "data-shell-qa-result",
        JSON.stringify(payload),
      );
    }

    const t = window.setTimeout(report, 120);
    window.addEventListener("resize", report);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", report);
    };
  }, [pageId]);

  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Shell QA is development-only.</main>;
  }

  return (
    <DashboardShell displayName="QA Tester" email="qa@example.com">
      <AppPageIntro
        slot={page.slot}
        title={page.title}
        description="Shell QA harness — measuring main-column heroes."
        priority={false}
      />
      <div className="shell-qa-body app-page mx-auto max-w-6xl space-y-4">
        <p className="text-ink-muted">
          Sample page body for {page.title}. Padding and max-width should hold.
        </p>
        <div className="h-40 rounded-xl bg-canvas-deep/40" />
      </div>
    </DashboardShell>
  );
}
