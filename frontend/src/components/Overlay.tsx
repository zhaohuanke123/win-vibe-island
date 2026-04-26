import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";
import "./Overlay.css";

interface DemoConfig {
  transition_delay_ms: number;
  session_count: number;
  session_spawn_delay_ms: number;
}

interface DemoStatus {
  running: boolean;
  config: DemoConfig;
}

const SPEED_OPTIONS: { label: string; delay: number }[] = [
  { label: "Fast", delay: 500 },
  { label: "Normal", delay: 1000 },
  { label: "Slow", delay: 2000 },
  { label: "Very Slow", delay: 5000 },
];

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
  const [demoRunning, setDemoRunning] = useState(false);
  const [processWatcherRunning, setProcessWatcherRunning] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState(1); // Normal
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for approval_request events from the backend
  // Also auto-expand when approval request comes in
  useEffect(() => {
    const unlisten: Promise<UnlistenFn> = listen<{ session_id: string; action: string; risk_level: string }>(
      "approval_request",
      (event) => {
        const { session_id, action, risk_level } = event.payload;
        const session = sessions.find((s) => s.id === session_id);
        setApprovalRequest({
          sessionId: session_id,
          sessionLabel: session?.label ?? "Unknown Session",
          action,
          riskLevel: risk_level as "low" | "medium" | "high",
          timestamp: Date.now(),
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

  // Check demo status on mount
  useEffect(() => {
    invoke<DemoStatus>("get_demo_config_status")
      .then((status) => setDemoRunning(status.running))
      .catch(() => {});

    // Check process watcher status
    invoke<{ running: boolean }>("get_process_watcher_status")
      .then((status) => setProcessWatcherRunning(status.running))
      .catch(() => {});
  }, []);

  // Dynamic window resize based on expanded state
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        // Calculate expected size based on state
        const sessionCount = sessions.length;
        const hasApproval = approvalRequest !== null;
        const isDev = import.meta.env.DEV;

        // Base sizes - more accurate
        const barHeight = 36;
        const panelPadding = 8;
        const sessionItemHeight = 48; // Increased for more info
        const approvalPanelHeight = hasApproval ? 140 : 0;
        const demoControlsHeight = isDev ? 120 : 0;
        const emptyStateHeight = sessionCount === 0 ? 50 : 0;
        const headerHeight = 24; // "Sessions" header

        // Max visible sessions before scroll
        const maxVisibleSessions = 4;
        const visibleSessions = Math.min(sessionCount, maxVisibleSessions);
        const scrollHint = sessionCount > maxVisibleSessions ? 20 : 0;

        // Calculate panel height
        const panelContentHeight = Math.max(
          headerHeight + visibleSessions * sessionItemHeight + scrollHint + approvalPanelHeight + demoControlsHeight,
          emptyStateHeight
        );
        const panelHeight = expanded ? panelPadding + panelContentHeight : 0;

        // Total height with margin
        const totalHeight = barHeight + panelHeight + 8;

        // Width
        const width = expanded ? 320 : 260;

        await invoke("set_window_size", { width, height: totalHeight });
      } catch (e) {
        console.error("Failed to resize window:", e);
      }
    };

    resizeWindow();
  }, [expanded, sessions.length, approvalRequest]);

  const toggleDemo = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (demoRunning) {
        await invoke("toggle_demo_mode", { start: false });
        setDemoRunning(false);
      } else {
        // Set speed before starting
        const config: DemoConfig = {
          transition_delay_ms: SPEED_OPTIONS[selectedSpeed].delay,
          session_count: 0,
          session_spawn_delay_ms: SPEED_OPTIONS[selectedSpeed].delay * 2,
        };
        await invoke("set_demo_config", { config });
        await invoke("toggle_demo_mode", { start: true });
        setDemoRunning(true);
      }
    } catch (e) {
      console.error("Failed to toggle demo mode:", e);
      setError(`Demo mode error: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProcessWatcher = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (processWatcherRunning) {
        await invoke("stop_process_watcher");
        setProcessWatcherRunning(false);
      } else {
        await invoke("start_process_watcher");
        setProcessWatcherRunning(true);
      }
    } catch (e) {
      console.error("Failed to toggle process watcher:", e);
      setError(`Process watcher error: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

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

          {/* Demo controls - only visible in dev mode */}
          {import.meta.env.DEV && (
            <div className="overlay__demo-controls">
              <div className="overlay__demo-header">Demo Mode</div>
              <div className="overlay__demo-row">
                <select
                  className="overlay__speed-select"
                  value={selectedSpeed}
                  onChange={(e) => setSelectedSpeed(Number(e.target.value))}
                  disabled={demoRunning}
                >
                  {SPEED_OPTIONS.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
                <button
                  className={`overlay__demo-btn ${demoRunning ? "overlay__demo-btn--stop" : ""}`}
                  onClick={toggleDemo}
                  disabled={isLoading}
                >
                  {isLoading ? <span className="overlay__spinner" /> : (demoRunning ? "Stop" : "Start")}
                </button>
              </div>

              {/* Process Watcher controls */}
              <div className="overlay__demo-header" style={{ marginTop: "8px" }}>Process Watcher</div>
              <div className="overlay__demo-row">
                <button
                  className={`overlay__demo-btn ${processWatcherRunning ? "overlay__demo-btn--stop" : ""}`}
                  onClick={toggleProcessWatcher}
                  disabled={isLoading}
                  style={{ width: "100%" }}
                >
                  {isLoading ? <span className="overlay__spinner" /> : (processWatcherRunning ? "Stop Watching" : "Start Watching")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}