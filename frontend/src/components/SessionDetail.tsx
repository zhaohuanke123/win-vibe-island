import { motion } from "framer-motion";
import type { Session } from "../store/sessions";
import { ToolExecutionDetail } from "./ToolExecutionDetail";
import "./SessionDetail.css";

interface SessionDetailProps {
  session: Session;
  onBack: () => void;
  "data-testid"?: string;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function toolInputPreview(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "";
  const first = entries[0];
  const val = typeof first[1] === "string" ? first[1] : JSON.stringify(first[1]);
  const preview = `${first[0]}: ${val}`;
  return preview.length > 80 ? preview.slice(0, 80) + "..." : preview;
}

const STATE_COLORS: Record<string, string> = {
  idle: "#9ca3af",
  thinking: "#a78bfa",
  running: "#60a5fa",
  streaming: "#22d3ee",
  approval: "#fbbf24",
  error: "#f87171",
  done: "#4ade80",
};

export function SessionDetail({ session, onBack, "data-testid": testId }: SessionDetailProps) {
  const recentHistory = session.toolHistory.slice(-10).reverse();

  return (
    <motion.div
      className="session-detail"
      data-testid={testId || "session-detail"}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div className="session-detail__header">
        <button className="session-detail__back-btn" onClick={onBack} data-testid="detail-back-btn">
          ← Back
        </button>
      </div>

      <div className="session-detail__body">
        <div className="session-detail__label-row">
          <span
            className="session-detail__state-dot"
            style={{ backgroundColor: STATE_COLORS[session.state] || "#9ca3af" }}
          />
          <span className="session-detail__label" title={session.label}>{session.label}</span>
        </div>

        <div className="session-detail__info-grid">
          <div className="session-detail__info-item">
            <span className="session-detail__info-key">State</span>
            <span
              className="session-detail__info-value session-detail__state"
              style={{ color: STATE_COLORS[session.state] || "#9ca3af" }}
            >
              {session.state}
            </span>
          </div>
          <div className="session-detail__info-item session-detail__info-item--full">
            <span className="session-detail__info-key">Working Directory</span>
            <span className="session-detail__info-value session-detail__cwd" title={session.cwd}>
              {session.cwd || "-"}
            </span>
          </div>
          <div className="session-detail__info-item">
            <span className="session-detail__info-key">Created</span>
            <span className="session-detail__info-value">{formatTimestamp(session.createdAt)}</span>
          </div>
          <div className="session-detail__info-item">
            <span className="session-detail__info-key">Last Activity</span>
            <span className="session-detail__info-value">{formatTimestamp(session.lastActivity)}</span>
          </div>
          {session.pid !== undefined && (
            <div className="session-detail__info-item">
              <span className="session-detail__info-key">PID</span>
              <span className="session-detail__info-value">{session.pid}</span>
            </div>
          )}
          {session.model && (
            <div className="session-detail__info-item">
              <span className="session-detail__info-key">Model</span>
              <span className="session-detail__info-value">{session.model}</span>
            </div>
          )}
          {session.source && (
            <div className="session-detail__info-item">
              <span className="session-detail__info-key">Source</span>
              <span className="session-detail__info-value">{session.source}</span>
            </div>
          )}
        </div>

        {session.currentTool && (
          <div className="session-detail__section">
            <div className="session-detail__section-title">Current Tool</div>
            <div className="session-detail__tool-card">
              <span className="session-detail__tool-name">{session.currentTool.name}</span>
              {Object.keys(session.currentTool.input).length > 0 && (
                <span className="session-detail__tool-input" title={JSON.stringify(session.currentTool.input)}>
                  {toolInputPreview(session.currentTool.input)}
                </span>
              )}
              <span className="session-detail__tool-time">
                Running for {formatDuration(Date.now() - session.currentTool.startTime)}
              </span>
            </div>
          </div>
        )}

        {session.lastError && (
          <div className="session-detail__section">
            <div className="session-detail__section-title">Last Error</div>
            <div className="session-detail__error">{session.lastError}</div>
          </div>
        )}

        <div className="session-detail__section session-detail__section--history">
          <div className="session-detail__section-title">
            Tool History ({session.toolHistory.length})
          </div>
          {recentHistory.length > 0 ? (
            <div className="session-detail__history-list">
              {recentHistory.map((exec) => (
                <ToolExecutionDetail key={exec.id} execution={exec} />
              ))}
            </div>
          ) : (
            <div className="session-detail__empty">No tool executions yet</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
