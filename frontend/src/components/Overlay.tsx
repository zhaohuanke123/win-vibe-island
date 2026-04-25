import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StatusDot } from "./StatusDot";
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

export function Overlay() {
  const { sessions, activeSessionId, setActiveSession } = useSessionsStore();
  const active = sessions.find((s) => s.id === activeSessionId);

  const [expanded, setExpanded] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState(1); // Normal

  // Handle session click: set as active and focus the corresponding window
  const handleSessionClick = async (session: Session) => {
    setActiveSession(session.id);

    // Focus the window belonging to this session's process
    if (session.pid) {
      try {
        const result = await invoke<FocusResult>("focus_session_window", {
          sessionPid: session.pid,
        });
        console.log("Focus result:", result, "for session:", session.label);
      } catch (e) {
        console.error("Failed to focus session window:", e);
      }
    }
  };

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
  }, []);

  const toggleDemo = async () => {
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
    }
  };

  return (
    <div className={`overlay ${expanded ? "overlay--expanded" : ""}`}>
      <div className="overlay__bar" onClick={() => setExpanded(!expanded)}>
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
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`overlay__session ${s.id === activeSessionId ? "overlay__session--active" : ""}`}
              onClick={() => handleSessionClick(s)}
            >
              <StatusDot state={s.state} />
              <span>{s.label}</span>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="overlay__empty">Waiting for agent sessions...</div>
          )}

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
                >
                  {demoRunning ? "Stop" : "Start"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}