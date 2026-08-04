"use client";

import { useEffect } from "react";

/**
 * Root error boundary — must render its own <html> / <body>.
 * Used when the root layout itself fails.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme="original">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f3f1ec",
          color: "#2a2623",
        }}
      >
        <div style={{ maxWidth: 28 * 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: 0, fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: 12,
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "#726c66",
            }}
          >
            Family Memory Vault hit an unexpected error. Try refreshing the
            page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 24,
              border: 0,
              borderRadius: 8,
              background: "#4a7c6f",
              color: "#fff",
              padding: "0.65rem 1.1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
