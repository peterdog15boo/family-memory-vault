"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Loader2, X } from "lucide-react";
import type { SerializedPrivateDocument } from "@/lib/documents/serialize";
import {
  documentViewKindLabel,
  getDocumentViewKind,
  type DocumentViewKind,
} from "@/lib/documents/view";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

type DocumentViewerDialogProps = {
  document: SerializedPrivateDocument;
  onClose: () => void;
};

type SpreadsheetSheet = {
  name: string;
  rows: string[][];
};

const MAX_SHEET_ROWS = 200;
const MAX_SHEET_COLS = 40;

/**
 * In-app private document viewer — portaled above shell chrome.
 * Supports PDF, images, plain text / RTF-as-text, and Excel spreadsheets.
 * Caller should confirm sensitive access before mounting.
 */
export function DocumentViewerDialog({
  document: doc,
  onClose,
}: DocumentViewerDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SpreadsheetSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);

  const kind = useMemo(
    () => getDocumentViewKind(doc.contentType, doc.originalFilename),
    [doc.contentType, doc.originalFilename],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayA11y({
    open: mounted,
    onClose,
    containerRef: dialogRef,
  });

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/documents/${doc.id}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: true }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || "Could not load document.");
        }

        const blob = await res.blob();
        if (cancelled) return;

        if (kind === "unsupported") {
          setError(
            "This file type can’t be previewed in the vault. Use Download to open it on your device.",
          );
          return;
        }

        if (kind === "text") {
          const text = await blob.text();
          if (!cancelled) setTextContent(text);
          return;
        }

        if (kind === "spreadsheet") {
          const buffer = await blob.arrayBuffer();
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(buffer, { type: "array" });
          const parsed: SpreadsheetSheet[] = workbook.SheetNames.map((name) => {
            const sheet = workbook.Sheets[name];
            const matrix = sheet
              ? (XLSX.utils.sheet_to_json(sheet, {
                  header: 1,
                  defval: "",
                  raw: false,
                }) as unknown[][])
              : [];
            const rows = matrix.slice(0, MAX_SHEET_ROWS).map((row) =>
              (Array.isArray(row) ? row : [])
                .slice(0, MAX_SHEET_COLS)
                .map((cell) => (cell == null ? "" : String(cell))),
            );
            return { name, rows };
          });
          if (!cancelled) {
            setSheets(parsed);
            setActiveSheet(0);
          }
          return;
        }

        createdUrl = URL.createObjectURL(blob);
        if (!cancelled) setObjectUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load document.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [doc.id, kind]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-viewer-title"
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-[color:var(--doc-paper,#fffdf8)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--doc-line)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--doc-muted)]">
              <Eye className="size-3.5" aria-hidden />
              {documentViewKindLabel(kind)} preview
            </p>
            <h2
              id="document-viewer-title"
              className="mt-1 truncate font-display text-lg text-[color:var(--doc-ink)] sm:text-xl"
            >
              {doc.title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-[color:var(--doc-muted)]">
              {doc.originalFilename}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[color:var(--doc-muted)] transition hover:bg-black/5 hover:text-[color:var(--doc-ink)]"
            aria-label="Close viewer"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="relative min-h-[240px] flex-1 overflow-auto bg-black/[0.03]">
          {loading ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-sm text-[color:var(--doc-muted)]">
              <Loader2 className="size-6 animate-spin" aria-hidden />
              Loading document…
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[240px] items-center justify-center p-6">
              <p className="max-w-md rounded-xl border border-red-800/15 bg-red-50 px-4 py-3 text-center text-sm text-red-900">
                {error}
              </p>
            </div>
          ) : (
            <ViewerBody
              kind={kind}
              objectUrl={objectUrl}
              textContent={textContent}
              sheets={sheets}
              activeSheet={activeSheet}
              onSheetChange={setActiveSheet}
              title={doc.title}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ViewerBody({
  kind,
  objectUrl,
  textContent,
  sheets,
  activeSheet,
  onSheetChange,
  title,
}: {
  kind: DocumentViewKind;
  objectUrl: string | null;
  textContent: string | null;
  sheets: SpreadsheetSheet[];
  activeSheet: number;
  onSheetChange: (index: number) => void;
  title: string;
}) {
  if (kind === "pdf" && objectUrl) {
    return (
      <iframe
        title={title}
        src={objectUrl}
        className="h-[min(78vh,760px)] w-full border-0 bg-white"
      />
    );
  }

  if (kind === "image" && objectUrl) {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt={title}
          className="max-h-[min(78vh,760px)] max-w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "text" && textContent != null) {
    return (
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed text-[color:var(--doc-ink)] sm:p-5">
        {textContent || "(Empty file)"}
      </pre>
    );
  }

  if (kind === "spreadsheet" && sheets.length > 0) {
    const sheet = sheets[activeSheet] ?? sheets[0];
    const colCount = Math.max(1, ...sheet.rows.map((row) => row.length));

    return (
      <div className="flex h-full min-h-[240px] flex-col">
        {sheets.length > 1 ? (
          <div className="flex flex-wrap gap-1 border-b border-[color:var(--doc-line)] bg-white/70 px-3 py-2">
            {sheets.map((item, index) => (
              <button
                key={item.name}
                type="button"
                onClick={() => onSheetChange(index)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  index === activeSheet
                    ? "bg-[color:var(--doc-accent)] text-white"
                    : "text-[color:var(--doc-muted)] hover:bg-black/5 hover:text-[color:var(--doc-ink)]",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="overflow-auto p-3 sm:p-4">
          <table className="min-w-full border-collapse text-left text-xs text-[color:var(--doc-ink)]">
            <tbody>
              {sheet.rows.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-[color:var(--doc-muted)]">
                    This sheet is empty.
                  </td>
                </tr>
              ) : (
                sheet.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={
                      rowIndex === 0
                        ? "bg-[color:var(--doc-accent-soft)] font-medium"
                        : "odd:bg-white/40"
                    }
                  >
                    {Array.from({ length: colCount }, (_, colIndex) => (
                      <td
                        key={colIndex}
                        className="border border-[color:var(--doc-line)] px-2 py-1.5 align-top whitespace-pre-wrap"
                      >
                        {row[colIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {sheet.rows.length >= MAX_SHEET_ROWS ? (
            <p className="mt-3 text-xs text-[color:var(--doc-muted)]">
              Showing the first {MAX_SHEET_ROWS} rows. Download the file to see
              everything.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-sm text-[color:var(--doc-muted)]">
      Nothing to display.
    </div>
  );
}
