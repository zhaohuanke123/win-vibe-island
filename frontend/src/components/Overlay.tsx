import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { HookStatus } from "./HookStatus";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";
import "./Overlay.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

// Window dimensions
const BAR_HEIGHT = 60;
const EXPANDED_HEIGHT = 600;
const WINDOW_WIDTH = 420;

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
  const expandedRef = useRef(false);

  // Note: approval_request events are handled by useAgentEvents hook
  // which sets the approvalRequest in the store

  // Auto-expand when approval request comes in
  useEffect(() => {
    if (approvalRequest) {
      setExpanded(true);
    }
  }, [approvalRequest]);

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

  // Initialize window at bar height (collapsed state)
  useEffect(() => {
    invoke("set_window_size", { width: WINDOW_WIDTH, height: BAR_HEIGHT, skipCenter: false });
  }, []);

  // Resize window on expand/collapse
  useEffect(() => {
    if (expandedRef.current === expanded) return;
    expandedRef.current = expanded;

    const height = expanded ? EXPANDED_HEIGHT : BAR_HEIGHT;
    invoke("set_window_size", { width: WINDOW_WIDTH, height, skipCenter: false });
  }, [expanded]);

  const handleApprovalHandled = () => { clearApprovalRequest(); };

  const clearError = useCallback(() => { setError(null); }, []);

  return (
    <div className={`overlay ${expanded ? "overlay--expanded" : ""}`}>
      <div className="overlay__shell">
        <div className="overlay__bar" onClick={() => setExpanded(!expanded)}>
          {isLoading && <span className="overlay__spinner" />}
          {active ? (
            <>
              <StatusDot state={active.state} />
              <span className="overlay__label">{active.label}</span>
              <span className="overlay__state">{active.state}</span>
            </>
          ) : (
            <span className="overlay__label overlay__label--empty">No active sessions</span>
          )}
          <HookStatus />
        </div>

        <div className="overlay__panel">
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
          <div className="overlay__sessions-list">
            {sessions.map((s) => (
              <div key={s.id}
                className={`overlay__session ${s.id === activeSessionId ? "overlay__session--active" : ""}`}
                onClick={() => handleSessionClick(s)}
              >
                <div className="overlay__session-row">
                  <StatusDot state={s.state} />
                  <span className="overlay__session-label">{s.label}</span>
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
              </div>
            ))}
            {sessions.length === 0 && !error && (
              <div className="overlay__empty">Waiting for agent sessions...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
