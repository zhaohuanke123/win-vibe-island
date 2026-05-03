import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedOverlay } from "./AnimatedOverlay";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { HookStatus } from "./HookStatus";
import { SettingsPanel } from "./SettingsPanel";
import { OVERLAY_DIMENSIONS } from "../config/animation";
import { calculateOverlayLayout, type OverlayLayoutResult } from "./overlayLayout";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";
import "./Overlay.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export function Overlay() {
  const { sessions, activeSessionId, setActiveSession, approvalRequest, clearApprovalRequest } = useSessionsStore();
  const active = sessions.find((s) => s.id === activeSessionId);
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayLayout, setOverlayLayout] = useState<OverlayLayoutResult>(() => ({
    expandedHeight: OVERLAY_DIMENSIONS.expanded.minHeight,
    contentMaxHeight: OVERLAY_DIMENSIONS.expanded.maxHeight - OVERLAY_DIMENSIONS.compact.height,
    scrollRegionMaxHeight: OVERLAY_DIMENSIONS.expanded.maxHeight - OVERLAY_DIMENSIONS.compact.height,
  }));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sessionsListRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const hadApprovalRequestRef = useRef(false);

  // Note: approval_request events are handled by useAgentEvents hook
  // which sets the approvalRequest in the store

  // Auto-expand when approval request comes in
  useEffect(() => {
    if (approvalRequest) {
      hadApprovalRequestRef.current = true;
      const frame = window.requestAnimationFrame(() => setExpanded(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (hadApprovalRequestRef.current) {
      hadApprovalRequestRef.current = false;
      setExpanded(false);
    }
  }, [approvalRequest]);

  // Keep the capsule clickable in compact mode. The smaller compact footprint
  // replaces the old click-through behavior.
  useEffect(() => {
    invoke("set_window_interactive", { interactive: true }).catch((e) => {
      console.error("Failed to set window interactive mode:", e);
    });
  }, []);

  const handleSessionClick = useCallback(async (session: Session) => {
    setActiveSession(session.id);
    setError(null);
    if (session.pid) {
      setIsLoading(true);
      try {
        const result = await invoke<FocusResult>("focus_session_window", { sessionPid: session.pid });
        console.log("Focus result:", result, "for session:", session.label);
      } catch (e) {
        console.error("Failed to focus session window:", e);
        setError(`Failed to focus window: ${e}`);
      } finally {
        setIsLoading(false);
      }
    }
  }, [setActiveSession]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, activeSessionId, setActiveSession]);

  const measureExpandedLayout = useCallback(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!panel || !content || !footer) return;

    const styles = window.getComputedStyle(panel);
    const panelPaddingY =
      Number.parseFloat(styles.paddingTop || "0") + Number.parseFloat(styles.paddingBottom || "0");

    const footerHeight = footer.getBoundingClientRect().height || footer.offsetHeight;
    const sessionsList = sessionsListRef.current;
    const visibleScrollRegionHeight = sessionsList
      ? sessionsList.getBoundingClientRect().height || sessionsList.clientHeight
      : content.getBoundingClientRect().height || content.clientHeight;
    const scrollRegionNaturalHeight = sessionsList ? sessionsList.scrollHeight : content.scrollHeight;
    const contentNaturalHeight = sessionsList
      ? content.scrollHeight - visibleScrollRegionHeight + scrollRegionNaturalHeight
      : content.scrollHeight;

    const nextLayout = calculateOverlayLayout({
      panelPaddingY,
      contentNaturalHeight,
      footerHeight,
      scrollRegionNaturalHeight,
    });

    setOverlayLayout((currentLayout) => (
      Math.abs(currentLayout.expandedHeight - nextLayout.expandedHeight) < 1
        && Math.abs(currentLayout.contentMaxHeight - nextLayout.contentMaxHeight) < 1
        && Math.abs(currentLayout.scrollRegionMaxHeight - nextLayout.scrollRegionMaxHeight) < 1
        ? currentLayout
        : nextLayout
    ));
  }, []);

  useLayoutEffect(() => {
    if (!expanded) return;

    measureExpandedLayout();
    const frame = window.requestAnimationFrame(measureExpandedLayout);
    const panel = panelRef.current;
    const content = contentRef.current;
    const sessionsList = sessionsListRef.current;
    const footer = footerRef.current;
    if (!panel || typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(() => measureExpandedLayout());
    observer.observe(panel);
    if (content) {
      observer.observe(content);
      Array.from(content.children).forEach((child) => observer.observe(child));
    }
    if (sessionsList) observer.observe(sessionsList);
    if (footer) observer.observe(footer);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [approvalRequest, expanded, measureExpandedLayout, showSettings]);

  useLayoutEffect(() => {
    if (!expanded) return;
    measureExpandedLayout();
    const frame = window.requestAnimationFrame(measureExpandedLayout);
    return () => window.cancelAnimationFrame(frame);
  }, [approvalRequest, error, expanded, measureExpandedLayout, sessions, showSettings]);

  const handleApprovalHandled = () => {
    clearApprovalRequest();
    setExpanded(false);
  };

  const clearError = useCallback(() => { setError(null); }, []);
  const panelStyle = {
    "--overlay-panel-content-max-height": `${overlayLayout.contentMaxHeight}px`,
    "--overlay-scroll-region-max-height": `${overlayLayout.scrollRegionMaxHeight}px`,
  } as CSSProperties;

  return (
    <AnimatedOverlay
      className={`overlay ${expanded ? "overlay--expanded" : "overlay--compact"}`}
      expandedHeight={overlayLayout.expandedHeight}
      isExpanded={expanded}
    >
      <div className="overlay__shell">
        <div className="overlay__bar" onClick={() => setExpanded(!expanded)}>
          {isLoading && <span className="overlay__spinner" />}
          {active ? (
            <>
              <StatusDot state={active.state} />
              <span className="overlay__label" title={active.label}>{active.label}</span>
              <span className="overlay__state">{active.state}</span>
            </>
          ) : (
            <span className="overlay__label overlay__label--empty">No active sessions</span>
          )}
          <HookStatus />
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              className="overlay__panel"
              ref={panelRef}
              style={panelStyle}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {error && (
                <div className="overlay__error" onClick={clearError}>
                  <span className="overlay__error-icon">!</span>
                  <span>{error}</span>
                </div>
              )}
              {showSettings ? (
                <div className="overlay__panel-content overlay__panel-content--scrollable" ref={contentRef}>
                  <SettingsPanel />
                </div>
              ) : (
                <div className="overlay__panel-content" ref={contentRef}>
                  {approvalRequest && (
                    <ApprovalPanel key={approvalRequest.timestamp} request={approvalRequest} onApprovalHandled={handleApprovalHandled} />
                  )}
                  {sessions.length > 0 && (
                    <div className="overlay__sessions-header">Sessions ({sessions.length})</div>
                  )}
                  <motion.div
                    className="overlay__sessions-list"
                    ref={sessionsListRef}
                    initial="hidden"
                    animate="show"
                    variants={{
                      hidden: {},
                      show: { transition: { staggerChildren: 0.035 } },
                    }}
                  >
                    {sessions.map((s) => (
                      <motion.div
                        key={s.id}
                        className={`overlay__session ${s.id === activeSessionId ? "overlay__session--active" : ""}`}
                        onClick={() => handleSessionClick(s)}
                        variants={{
                          hidden: { opacity: 0, y: 6 },
                          show: { opacity: 1, y: 0 },
                        }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        <div className="overlay__session-row">
                          <StatusDot state={s.state} />
                          <span className="overlay__session-label" title={s.label}>{s.label}</span>
                        </div>
                        {s.currentTool && (
                          <div className="overlay__session-info">
                            <span className="overlay__session-tool">{s.currentTool.name}</span>
                            {(s.currentTool.input?.file_path as string) && <span className="overlay__session-file">{(s.currentTool.input.file_path as string).split("/").pop()}</span>}
                          </div>
                        )}
                        {s.lastActivity && (
                          <div className="overlay__session-time">{formatTime(s.lastActivity)}</div>
                        )}
                      </motion.div>
                    ))}
                    {sessions.length === 0 && !error && (
                      <div className="overlay__empty">Waiting for agent sessions...</div>
                    )}
                  </motion.div>
                </div>
              )}
              <div className="overlay__panel-footer" ref={footerRef}>
                <button
                  className="overlay__settings-btn"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  {showSettings ? "← Back" : "⚙ Settings"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedOverlay>
  );
}
