"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { Ava } from "@/components/ava/Ava";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { useAskAi } from "@/components/assistant/AskAiContext";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

const MOBILE_MQ = "(max-width: 639px)";

/**
 * Floating Ask AI — desktop bottom-right dock, mobile near-full sheet.
 * Chat stays mounted after first open; closed state uses `hidden` (no orphan overlay).
 */
export function AskAiPanel() {
  const {
    open,
    closeAskAi,
    minimizeAskAi,
    conversationId,
    setConversationId,
    focusNonce,
    openAskAi,
  } = useAskAi();
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [keepAlive, setKeepAlive] = useState(false);
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep chat mounted after first open (same-render open: no extra frame delay).
  if (open && !keepAlive) {
    setKeepAlive(true);
  }

  // Mobile: lock background scroll; track visualViewport for keyboard.
  useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia(MOBILE_MQ);
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;

    function lockScrollIfMobile() {
      if (mq.matches) {
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
      } else {
        document.body.style.overflow = prevOverflow;
        document.body.style.touchAction = prevTouchAction;
      }
    }

    function syncViewport() {
      const root = rootRef.current;
      const vv = window.visualViewport;
      if (!root || !vv) return;
      if (!mq.matches) {
        root.style.removeProperty("--ask-ai-vv-height");
        root.style.removeProperty("--ask-ai-vv-offset");
        return;
      }
      root.style.setProperty("--ask-ai-vv-height", `${Math.round(vv.height)}px`);
      root.style.setProperty("--ask-ai-vv-offset", `${Math.round(vv.offsetTop)}px`);
    }

    lockScrollIfMobile();
    syncViewport();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    mq.addEventListener("change", lockScrollIfMobile);
    mq.addEventListener("change", syncViewport);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      mq.removeEventListener("change", lockScrollIfMobile);
      mq.removeEventListener("change", syncViewport);
      rootRef.current?.style.removeProperty("--ask-ai-vv-height");
      rootRef.current?.style.removeProperty("--ask-ai-vv-offset");
    };
  }, [open, closeAskAi]);

  // Escape, focus trap, restore to FAB/header trigger. Composer still
  // receives focus via focusNonce inside AssistantChat.
  useOverlayA11y({
    open,
    onClose: closeAskAi,
    containerRef: panelRef,
    lockScroll: false,
    initialFocus: "container",
  });

  if (!mounted || (!open && !keepAlive)) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={cn("ask-ai-panel-root", open ? "is-open" : "is-closed")}
      aria-hidden={!open}
    >
      {open ? (
        <button
          type="button"
          className="ask-ai-panel-backdrop"
          aria-label={t("assistant.close")}
          onClick={closeAskAi}
        />
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ask-ai-panel"
      >
        <header className="ask-ai-panel-header">
          <div className="ask-ai-panel-brand min-w-0">
            <Ava size="sm" className="ask-ai-panel-ava !size-9" decorative />
            <div className="min-w-0">
              <h2 id={titleId} className="ask-ai-panel-title">
                {t("assistant.title")}
              </h2>
              <p className="ask-ai-panel-subtitle">
                {t("assistant.subtitle")}
              </p>
            </div>
          </div>
          <div className="ask-ai-panel-actions">
            <button
              type="button"
              onClick={() => openAskAi({ fresh: true })}
              className="ask-ai-panel-icon-btn"
              aria-label={t("assistant.newChatAria")}
              title={t("assistant.newChat")}
            >
              <Plus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={minimizeAskAi}
              className="ask-ai-panel-icon-btn ask-ai-panel-minimize"
              aria-label={t("assistant.minimize")}
              title={t("assistant.minimize")}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={closeAskAi}
              className="ask-ai-panel-icon-btn ask-ai-panel-close"
              aria-label={t("assistant.close")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="ask-ai-panel-body">
          <AssistantChat
            variant="panel"
            initialConversationId={conversationId}
            resumeLatestIfEmpty
            focusNonce={focusNonce}
            onConversationIdChange={setConversationId}
            onClose={closeAskAi}
            onNavigateAway={closeAskAi}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
