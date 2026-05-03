import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedOverlay } from "./AnimatedOverlay";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { HookStatus } from "./HookStatus";
import { SettingsPanel } from "./SettingsPanel";
import { SessionDetail } from "./SessionDetail";
import { SessionList } from "./SessionList";
import { ActivityTimeline } from "./ActivityTimeline";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";
import "./Overlay.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

const BAR_HEIGHT = 52;
const EXPANDED_MIN = 400;
const EXPANDED_MAX = 600;

export function Overlay() {
  const { sessions, activeSessionId, setActiveSession, approvalRequest, clearApprovalRequest } = useSessionsStore();
  const active = sessions.find((s) => s.id === activeSessionId);
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const viewingSession = viewingSessionId ? sessions.find((s) => s.id === viewingSessionId) ?? null : null;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hadApprovalRequestRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(EXPANDED_MAX);

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

  // Collapse clears detail view; removed sessions clear detail view
  useEffect(() => {
    if (!expanded) {
      setViewingSessionId(null);
    }
  }, [expanded]);

  useEffect(() => {
    if (viewingSessionId && !sessions.find((s) => s.id === viewingSessionId)) {
      setViewingSessionId(null);
    }
  }, [sessions, viewingSessionId]);

  const handleSessionClick = useCallback(async (session: Session) => {
    setActiveSession(session.id);
    setError(null);

    if (expanded) {
      setViewingSessionId((prev) => (prev === session.id ? null : session.id));
    }

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
  }, [setActiveSession, expanded]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, activeSessionId, setActiveSession]);

  // Measure panel content height when expanded.
  // Uses ResizeObserver to wait for width animation to complete before measuring,
  // since width (236→420) and height animate simultaneously in Tauri.
  useEffect(() => {
    if (!expanded || !panelRef.current) return;

    const panel = panelRef.current;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        const p = panelRef.current;
        const prev = p.style.height;
        p.style.height = "auto";
        const contentH = p.scrollHeight;
        p.style.height = prev;
        const next = Math.min(EXPANDED_MAX, Math.max(EXPANDED_MIN, BAR_HEIGHT + contentH));
        console.log(`[measure] contentH=${contentH} BAR_HEIGHT=${BAR_HEIGHT} next=${next} sessions=${sessions.length}`);
        setMeasuredHeight((h) => (Math.abs(h - next) < 1 ? h : next));
      });
    };

    measure();

    const observer = new ResizeObserver(() => measure());
    observer.observe(panel);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [expanded, approvalRequest, showSettings, showActivity, sessions.length, viewingSessionId]);

  const handleApprovalHandled = () => {
    clearApprovalRequest();
    setExpanded(false);
  };

  const clearError = useCallback(() => { setError(null); }, []);

  const shouldUseAdaptiveHeight = !approvalRequest && !showSettings && !showActivity;
  const overlayExpandedHeight = shouldUseAdaptiveHeight ? measuredHeight : EXPANDED_MAX;

  return (
    <AnimatedOverlay
      className={`overlay ${expanded ? "overlay--expanded" : "overlay--compact"}`}
      data-testid="overlay"
      isExpanded={expanded}
      expandedHeight={expanded ? overlayExpandedHeight : undefined}
    >
      <div className="overlay__shell">
        <div className="overlay__bar" data-testid="status-bar" onClick={() => setExpanded(!expanded)}>
          {isLoading && <span className="overlay__spinner" />}
          {active ? (
            <>
              <StatusDot state={active.state} data-testid="status-dot" />
              <span className="overlay__label" data-testid="session-label" title={active.label}>{active.label}</span>
              <span className="overlay__state" data-testid="session-state">{active.state}</span>
            </>
          ) : (
            <span className="overlay__label overlay__label--empty" data-testid="empty-state">No active sessions</span>
          )}
          <HookStatus data-testid="hook-status" />
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              className="overlay__panel"
              ref={panelRef}
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
                <SettingsPanel />
              ) : showActivity ? (
                <ActivityTimeline data-testid="activity-timeline" />
              ) : (
                <>
                  {approvalRequest && (
                    <ApprovalPanel key={approvalRequest.timestamp} request={approvalRequest} onApprovalHandled={handleApprovalHandled} />
                  )}
                  {viewingSession ? (
                    <SessionDetail session={viewingSession} onBack={() => setViewingSessionId(null)} data-testid="session-detail" />
                  ) : (
                    <SessionList
                      sessions={sessions}
                      activeSessionId={activeSessionId}
                      viewingSessionId={viewingSessionId}
                      onSessionClick={handleSessionClick}
                      data-testid="sessions-list"
                    />
                  )}
                </>
              )}
              <div className="overlay__panel-footer">
                <button
                  className="overlay__settings-btn"
                  data-testid="settings-btn"
                  onClick={() => { setShowSettings(!showSettings); setShowActivity(false); setViewingSessionId(null); }}
                >
                  {showSettings ? "← Back" : "⚙ Settings"}
                </button>
                <button
                  className="overlay__settings-btn"
                  data-testid="activity-btn"
                  onClick={() => { setShowActivity(!showActivity); setShowSettings(false); setViewingSessionId(null); }}
                >
                  {showActivity ? "← Back" : "📊 Activity"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedOverlay>
  );
}
