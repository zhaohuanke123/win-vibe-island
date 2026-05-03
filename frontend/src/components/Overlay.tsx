import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedOverlay } from "./AnimatedOverlay";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { HookStatus } from "./HookStatus";
import { SettingsPanel } from "./SettingsPanel";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";
import "./Overlay.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

const BAR_HEIGHT = 52;
const EXPANDED_MIN = 400;
const EXPANDED_MAX = 600;

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

  // Measure panel content height when expanded (session list only, not approval/settings)
  useEffect(() => {
    if (!expanded) return;

    let f1 = 0, f2 = 0, cancelled = false;
    f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => {
        if (cancelled || !panelRef.current) return;
        const panel = panelRef.current;
        const prev = panel.style.height;
        panel.style.height = "auto";
        const contentH = panel.scrollHeight;
        panel.style.height = prev;
        const next = Math.min(EXPANDED_MAX, Math.max(EXPANDED_MIN, BAR_HEIGHT + contentH));
        setMeasuredHeight((h) => (Math.abs(h - next) < 1 ? h : next));
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
    };
  }, [expanded, approvalRequest, showSettings, sessions.length]);

  const handleApprovalHandled = () => {
    clearApprovalRequest();
    setExpanded(false);
  };

  const clearError = useCallback(() => { setError(null); }, []);

  const shouldUseAdaptiveHeight = !approvalRequest && !showSettings;
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
              ) : (
                <>
                  {approvalRequest && (
                    <ApprovalPanel key={approvalRequest.timestamp} request={approvalRequest} onApprovalHandled={handleApprovalHandled} />
                  )}
                  {sessions.length > 0 && (
                    <div className="overlay__sessions-header" data-testid="sessions-header">Sessions ({sessions.length})</div>
                  )}
                  <motion.div
                    className="overlay__sessions-list"
                    data-testid="sessions-list"
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
                        data-testid="session-item"
                        data-session-id={s.id}
                        onClick={() => handleSessionClick(s)}
                        variants={{
                          hidden: { opacity: 0, y: 6 },
                          show: { opacity: 1, y: 0 },
                        }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        <div className="overlay__session-row">
                          <StatusDot state={s.state} data-testid="status-dot" />
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
                      <div className="overlay__empty" data-testid="sessions-empty">Waiting for agent sessions...</div>
                    )}
                  </motion.div>
                </>
              )}
              <div className="overlay__panel-footer">
                <button
                  className="overlay__settings-btn"
                  data-testid="settings-btn"
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
