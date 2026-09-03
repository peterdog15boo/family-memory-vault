"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type DialogErrorBoundaryProps = {
  /** Short recovery label, e.g. "Couldn't open movie tools" */
  title: string;
  onClose: () => void;
  children: ReactNode;
};

type DialogErrorBoundaryState = {
  error: Error | null;
};

/**
 * Keeps a thrown dialog from locking the shell (scroll-lock / blank page).
 * Shows a small recovery card with Close instead of freezing the tab.
 */
export class DialogErrorBoundary extends Component<
  DialogErrorBoundaryProps,
  DialogErrorBoundaryState
> {
  state: DialogErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DialogErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[dialog.error]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        data-app-portal=""
        className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/50 p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-error-title"
      >
        <div className="w-full max-w-sm rounded-xl border border-ink/10 bg-canvas p-5 shadow-xl">
          <h2
            id="dialog-error-title"
            className="font-display text-lg tracking-tight text-ink"
          >
            {this.props.title}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Something went wrong opening this panel. You can close it and try
            again.
          </p>
          <button
            type="button"
            className="ui-btn ui-btn-primary mt-4 w-full"
            onClick={() => {
              this.setState({ error: null });
              this.props.onClose();
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }
}
