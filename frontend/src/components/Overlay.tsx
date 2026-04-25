import { useEffect, useState } from "react";
import { StatusDot } from "./StatusDot";
import { useSessionsStore } from "../store/sessions";
import "./Overlay.css";

export function Overlay() {
  const { sessions, activeSessionId, setActiveSession } = useSessionsStore();
  const active = sessions.find((s) => s.id === activeSessionId);

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, activeSessionId, setActiveSession]);

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
              onClick={() => setActiveSession(s.id)}
            >
              <StatusDot state={s.state} />
              <span>{s.label}</span>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="overlay__empty">Waiting for agent sessions...</div>
          )}
        </div>
      )}
    </div>
  );
}
