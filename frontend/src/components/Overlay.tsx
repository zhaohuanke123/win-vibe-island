import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";
import "./Overlay.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

// Format timestamp to relative time
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

  // Listen for approval_request events from the backend
  // Also auto-expand when approval request comes in
  useEffect(() => {
    const unlisten: Promise<UnlistenFn> = listen<{ session_id: string; tool_use_id: string; tool_name?: string; action: string; risk_level: "low" | "medium" | "high"; diff?: { fileName: string; oldContent: string; newContent: string } }>(
      "approval_request",
      (event) => {
        const { session_id, tool_use_id, tool_name, action, risk_level, diff } = event.payload;
        const session = sessions.find((s) => s.id === session_id);
        setApprovalRequest({
          toolUseId: tool_use_id,
          sessionId: session_id,
          sessionLabel: session?.label ?? "Unknown Session",
          toolName: tool_name,
          action,
          riskLevel: risk_level,
          timestamp: Date.now(),
          diff: diff ? {
            fileName: diff.fileName,
            oldContent: diff.oldContent,
            newContent: diff.newContent,
          } : undefined,
        });
        // Auto-expand when approval request comes in
        setExpanded(true);
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [sessions, setApprovalRequest]);

  // Handle session click: set as active and focus the corresponding window
  const handleSessionClick = useCallback(async (session: Session) => {
    setActiveSession(session.id);
    setError(null);

    // Focus the window belonging to this session's process
    if (session.pid) {
      setIsLoading(true);
      try {
        const result = await invoke<FocusResult>("focus_session_window", {
          sessionPid: session.pid,
        });
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

  // Dynamic window resize based on expanded state
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        const sessionCount = sessions.length;
        const hasApproval = approvalRequest !== null;
        const hasDiff = approvalRequest?.diff !== undefined;

        // Base sizes - match CSS exactly
        // Bar: margin-top(8) + padding(8+8) + content(20-24px line-height) = ~48-56px
        const barHeight = 56;
        const panelPadding = 16; // Panel padding (8px * 2)
        const sessionItemHeight = 52;
        const emptyStateHeight = sessionCount === 0 ? 50 : 0;
        const headerHeight = 24;

        // Approval panel height calculation
        // Base: ~180px (header + session + action + footer + shortcuts + margins)
        // With diff: add ~220px (diff viewer max-height + margins)
        const approvalPanelBase = 180;
        const approvalPanelDiff = hasDiff ? 220 : 0;
        const approvalPanelHeight = hasApproval ? approvalPanelBase + approvalPanelDiff : 0;

        // Max visible sessions before scroll
        const maxVisibleSessions = 4;
        const visibleSessions = Math.min(sessionCount, maxVisibleSessions);
        const scrollHint = sessionCount > maxVisibleSessions ? 20 : 0;

        // Calculate panel height
        const panelContentHeight = Math.max(
          headerHeight + visibleSessions * sessionItemHeight + scrollHint + approvalPanelHeight,
          emptyStateHeight
        );
        const panelHeight = expanded ? panelPadding + panelContentHeight : 0;

        // Total height
        const totalHeight = barHeight + panelHeight;

        // Width - bar max-width is 320px, panel max-width is 320px
        const width = expanded ? 336 : 320;

        await invoke("set_window_size", { width, height: totalHeight });
      } catch (e) {
        console.error("Failed to resize window:", e);
      }
    };

    resizeWindow();
  }, [expanded, sessions.length, approvalRequest]);

  const handleApprovalHandled = () => {
    clearApprovalRequest();
  };

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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

      {expanded && (
        <div className="overlay__panel">
          {/* Error display */}
          {error && (
            <div className="overlay__error" onClick={clearError}>
              <span className="overlay__error-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* Approval Panel - shows when there's an approval request */}
          {approvalRequest && (
            <ApprovalPanel
              key={approvalRequest.timestamp}
              request={approvalRequest}
              onApprovalHandled={handleApprovalHandled}
            />
          )}

          {/* Sessions header */}
          {sessions.length > 0 && (
            <div className="overlay__sessions-header">
              Sessions ({sessions.length})
            </div>
          )}

          {/* Scrollable session list */}
          <div className="overlay__sessions-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`overlay__session ${s.id === activeSessionId ? "overlay__session--active" : ""}`}
                onClick={() => handleSessionClick(s)}
              >
                <div className="overlay__session-row">
                  <StatusDot state={s.state} />
                  <span className="overlay__session-label">{s.label}</span>
                </div>
                {/* Show tool info */}
                {s.toolName && (
                  <div className="overlay__session-info">
                    <span className="overlay__session-tool">{s.toolName}</span>
                    {s.filePath && (
                      <span className="overlay__session-file">{s.filePath.split("/").pop()}</span>
                    )}
                  </div>
                )}
                {/* Show time */}
                {s.lastActivity && (
                  <div className="overlay__session-time">
                    {formatTime(s.lastActivity)}
                  </div>
                )}
              </div>
            ))}
            {sessions.length === 0 && !error && (
              <div className="overlay__empty">Waiting for agent sessions...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
