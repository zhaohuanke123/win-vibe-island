import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
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
  const { sessions, activeSessionId, setActiveSession, approvalRequest, setApprovalRequest, clearApprovalRequest } = useSessionsStore();
  const active = sessions.find((s) => s.id === activeSessionId);
  const [expanded, setExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expandedRef = useRef(false);

  useEffect(() => {
    const unlisten: Promise<UnlistenFn> = listen<{
      session_id: string; tool_use_id: string; tool_name?: string;
      action: string; risk_level: "low" | "medium" | "high";
      diff?: { fileName: string; oldContent: string; newContent: string };
    }>("approval_request", (event) => {
      const { session_id, tool_use_id, tool_name, action, risk_level, diff } = event.payload;
      const session = sessions.find((s) => s.id === session_id);
      setApprovalRequest({
        toolUseId: tool_use_id, sessionId: session_id,
        sessionLabel: session?.label ?? "Unknown Session",
        toolName: tool_name, action, riskLevel: risk_level,
        timestamp: Date.now(),
        diff: diff ? { fileName: diff.fileName, oldContent: diff.oldContent, newContent: diff.newContent } : undefined,
      });
      setExpanded(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [sessions, setApprovalRequest]);

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

  // Initialize window: set small size for collapsed state, enable click-through
  useEffect(() => {
    invoke("set_window_size", { width: 420, height: 60, skipCenter: false });
    invoke("set_window_interactive", { interactive: false });
  }, []);

  // Sync expand state with window size and click-through
  useEffect(() => {
    if (expandedRef.current === expanded) return;
    expandedRef.current = expanded;

    // Update window size and interactivity
    const height = expanded ? 500 : 60;
    invoke("set_window_size", { width: 420, height, skipCenter: false });
    invoke("set_window_interactive", { interactive: expanded });
  }, [expanded]);

  const handleApprovalHandled = () => { clearApprovalRequest(); };

  const clearError = useCallback(() => { setError(null); }, []);

  return (
    <div className={`overlay ${expanded ? "overlay--expanded" : ""}`}>
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
              {s.toolName && (
                <div className="overlay__session-info">
                  <span className="overlay__session-tool">{s.toolName}</span>
                  {s.filePath && <span className="overlay__session-file">{s.filePath.split("/").pop()}</span>}
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
  );
}
