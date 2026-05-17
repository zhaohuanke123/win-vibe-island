import { memo, useMemo } from "react";
import type { Session } from "../store/sessions";
import { isAttentionPhase } from "../shared/phase-colors";
import "./PanelHead.css";

interface PanelHeadProps {
  sessions: Session[];
  onSettingsClick: () => void;
  "data-testid"?: string;
}

export const PanelHead = memo(function PanelHead({
  sessions,
  onSettingsClick,
  "data-testid": testId,
}: PanelHeadProps) {
  const counts = useMemo(() => {
    let waiting = 0;
    let running = 0;
    for (const s of sessions) {
      if (isAttentionPhase(s.state)) {
        waiting++;
      } else if (s.state === "running") {
        running++;
      }
    }
    return { total: sessions.length, waiting, running };
  }, [sessions]);

  return (
    <div className="panel-head" data-testid={testId || "panel-head"}>
      <span className="panel-head__title" data-testid="panel-head-title">
        Sessions
      </span>
      <div className="panel-head__chips" data-testid="panel-head-chips">
        {counts.waiting > 0 && (
          <span className="panel-head__chip panel-head__chip--waiting" data-testid="chip-waiting">
            <span className="panel-head__chip-dot panel-head__chip-dot--waiting" />
            {counts.waiting} waiting
          </span>
        )}
        {counts.running > 0 && (
          <span className="panel-head__chip panel-head__chip--running" data-testid="chip-running">
            <span className="panel-head__chip-dot panel-head__chip-dot--running" />
            {counts.running} running
          </span>
        )}
      </div>
      <button
        className="panel-head__gear"
        data-testid="panel-head-gear"
        onClick={onSettingsClick}
        title="Settings"
        aria-label="Open settings"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8 10a2 2 0 100-4 2 2 0 000 4z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.4 10a1.1 1.1 0 00.22 1.21l.04.04a1.33 1.33 0 11-1.89 1.89l-.04-.04a1.1 1.1 0 00-1.21-.22 1.1 1.1 0 00-.67 1.01v.11a1.33 1.33 0 11-2.67 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.21.22l-.04.04a1.33 1.33 0 11-1.89-1.89l.04-.04a1.1 1.1 0 00.22-1.21 1.1 1.1 0 00-1.01-.67h-.11a1.33 1.33 0 110-2.67h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.22-1.21l-.04-.04a1.33 1.33 0 111.89-1.89l.04.04a1.1 1.1 0 001.21.22h.05a1.1 1.1 0 00.67-1.01v-.11a1.33 1.33 0 012.67 0v.06a1.1 1.1 0 00.72 1.01 1.1 1.1 0 001.21-.22l.04-.04a1.33 1.33 0 111.89 1.89l-.04.04a1.1 1.1 0 00-.22 1.21v.05a1.1 1.1 0 001.01.67h.11a1.33 1.33 0 010 2.67h-.06a1.1 1.1 0 00-1.01.72z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
});
