import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedOverlay } from "./AnimatedOverlay";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { HookStatus } from "./HookStatus";
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleApprovalHandled = () => {
    clearApprovalRequest();
    setExpanded(false);
  };

  const clearError = useCallback(() => { setError(null); }, []);

  return (
    <AnimatedOverlay className={`overlay ${expanded ? "overlay--expanded" : "overlay--compact"}`} isExpanded={expanded}>
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
              {approvalRequest && (
                <ApprovalPanel key={approvalRequest.timestamp} request={approvalRequest} onApprovalHandled={handleApprovalHandled} />
              )}
              {sessions.length > 0 && (
                <div className="overlay__sessions-header">Sessions ({sessions.length})</div>
              )}
              <motion.div
                className="overlay__sessions-list"
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedOverlay>
  );
}
