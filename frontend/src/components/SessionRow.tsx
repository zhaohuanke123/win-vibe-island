import { useState, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StateIndicator } from "./StateIndicator";
import type { StateIndicatorKind } from "./StateIndicator";
import { NotifBody } from "./NotifBody";
import { getAgent, hexA } from "../shared/agents";
import { phaseColor, fmtAge, isAttentionPhase, getAttachmentState } from "../shared/phase-colors";
import type { AttachmentState } from "../shared/phase-colors";
import type { Session } from "../store/sessions";
import "./SessionRow.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored" | "CommandFailed";

/** Extract project name from cwd (last path segment). */
function extractProjectName(cwd: string): string {
  if (!cwd) return "";
  // Handle both forward-slash and backslash paths
  const normalized = cwd.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || cwd;
}

/** Extract branch from session metadata or label. */
function extractBranch(session: Session): string | null {
  // Try to get branch from title/label patterns like "project (branch)"
  const match = (session.title || session.label).match(/\(([^)]+)\)/);
  const branch = match ? match[1] : null;
  if (!branch || branch === "main" || branch === "master") return null;
  return branch;
}

interface SessionRowProps {
  session: Session;
  isActive?: boolean;
  indicatorKind?: StateIndicatorKind;
  density?: "comfortable" | "compact";
  groupBy?: "none" | "state" | "agent" | "project";
  onJump?: (session: Session) => void;
  onDetail?: (session: Session) => void;
  onContextMenu?: (session: Session, position: { x: number; y: number }) => void;
  "data-testid"?: string;
}

export const SessionRow = memo(function SessionRow({
  session,
  isActive = false,
  indicatorKind = "dot",
  density = "comfortable",
  groupBy = "none",
  onJump,
  onDetail,
  onContextMenu,
  "data-testid": testId,
}: SessionRowProps) {
  const stale = session.state === "completed" && (Date.now() - session.lastActivity) / 1000 > 300;
  const [expanded, setExpanded] = useState(!stale);
  const [jumping, setJumping] = useState(false);
  const attachmentState: AttachmentState = getAttachmentState(session);

  const handleRowClick = useCallback(async () => {
    if (onJump) {
      onJump(session);
      return;
    }
    // Default: invoke IPC to focus session window
    if (session.pid || session.jumpTarget) {
      setJumping(true);
      try {
        await invoke<FocusResult>("focus_session_window", {
          sessionPid: session.pid ?? null,
          jumpTarget: session.jumpTarget ?? null,
        });
      } catch {
        // Silently fail — the overlay is non-blocking
      } finally {
        setJumping(false);
      }
    }
  }, [session, onJump]);

  const handleChevronClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  const projectName = extractProjectName(session.cwd) || session.label || "";
  const branch = extractBranch(session);
  const agent = getAgent(session.agent ?? "claude");
  const phaseColorHex = phaseColor(session.state);
  const age = fmtAge(new Date(session.lastActivity));
  const terminalType = session.jumpTarget?.terminalType;

  const displayLabel = session.title || projectName;
  const hasTitle = !!session.title;

  const contentParts: string[] = [];
  const hideProject = groupBy === "project";
  if (hasTitle) {
    contentParts.push(displayLabel);
    if (projectName && !hideProject) contentParts.push(projectName);
  } else {
    if (projectName && !hideProject) contentParts.push(projectName);
    if (branch && !hideProject) contentParts.push(branch);
  }
  const promptPreview = session.lastPrompt
    ? session.lastPrompt.length > 50 ? session.lastPrompt.slice(0, 50) + "…" : session.lastPrompt
    : "";
  const msg = session.currentTool?.name
    ? `${session.currentTool.name}(...)`
    : session.lastError
      ? "error"
      : "";
  if (msg) contentParts.push(msg);
  else if (promptPreview && !hasTitle) contentParts.push(promptPreview);

  const isCompact = density === "compact";

  const rowClassName = [
    "session-row",
    isActive ? "session-row--active" : "",
    attachmentState === "stale" ? "session-row--stale" : "",
    attachmentState === "detached" ? "session-row--detached" : "",
    expanded ? "session-row--expanded" : "",
    isAttentionPhase(session.state) ? "session-row--attention" : "",
    jumping ? "session-row--jumping" : "",
    isCompact ? "session-row--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClassName}
      data-testid={testId || "session-row"}
      data-session-id={session.id}
      data-phase={session.state}
      style={
        indicatorKind === "bar"
          ? ({ "--phase-color": phaseColorHex } as React.CSSProperties)
          : undefined
      }
      onContextMenu={onContextMenu ? (e) => {
        e.preventDefault();
        onContextMenu(session, { x: e.clientX, y: e.clientY });
      } : undefined}
    >
      {/* Row body — click to jump */}
      <div className="session-row__body" onClick={handleRowClick}>
        <span className="session-row__indicator" data-testid="row-indicator">
          <StateIndicator
            kind={indicatorKind}
            phase={session.state}
            projectName={
              indicatorKind === "tint" ? projectName : undefined
            }
          />
        </span>

        <span className="session-row__content" data-testid="row-content">
          <span className="session-row__main" data-testid="row-main">
            <span
              className={
                indicatorKind === "tint"
                  ? "session-row__project session-row__project--tinted"
                  : "session-row__project"
              }
              style={
                indicatorKind === "tint"
                  ? { color: phaseColorHex }
                  : undefined
              }
            >
              {displayLabel}
            </span>
            {branch && !isCompact && (
              <>
                <span className="session-row__sep">·</span>
                <span className="session-row__branch">{branch}</span>
              </>
            )}
            {msg && (
              <>
                <span className="session-row__sep">·</span>
                <span className="session-row__msg">{msg}</span>
              </>
            )}
          </span>
          {!isCompact && session.lastPrompt && !hasTitle && (
            <span className="session-row__you">
              <span className="session-row__you-label">You:</span> {session.lastPrompt}
            </span>
          )}
        </span>

        {/* Agent chip */}
        <span
          className={`session-row__agent-chip${attachmentState === "detached" ? " session-row__agent-chip--dimmed" : ""}`}
          data-testid="agent-chip"
          style={{ color: agent.color, backgroundColor: hexA(agent.color, 0.13), borderColor: hexA(agent.color, 0.35) }}
        >
          {agent.cli}
        </span>

        {/* Terminal badge — hidden in compact */}
        {!isCompact && terminalType && (
          <span className="session-row__terminal-badge" data-testid="terminal-badge">
            {terminalType}
          </span>
        )}

        {/* Age */}
        <span className="session-row__age" data-testid="row-age">
          {age}
        </span>

        {/* Detail button */}
        {onDetail && (
          <button
            className="session-row__detail-btn"
            onClick={(e) => { e.stopPropagation(); onDetail(session); }}
            data-testid="row-detail-btn"
            aria-label="View session details"
          >
            <svg viewBox="0 0 16 16" width={isCompact ? 12 : 14} height={isCompact ? 12 : 14}
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" />
              <line x1="8" y1="7" x2="8" y2="11" />
              <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}

        {/* Chevron — click to expand/collapse */}
        <button
          className="session-row__chevron"
          onClick={handleChevronClick}
          data-testid="row-chevron"
          aria-label={expanded ? "Collapse details" : "Expand details"}
          aria-expanded={expanded}
        >
          <svg
            viewBox="0 0 16 16"
            width={isCompact ? 12 : 14}
            height={isCompact ? 12 : 14}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6 l4 4 l4 -4" />
          </svg>
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="session-row__detail" data-testid="row-detail">
          {session.notifKind && (
            <NotifBody
              kind={session.notifKind}
              session={session}
              onSubmit={(response) => {
                try {
                  invoke("submit_approval_response", {
                    toolUseId: session.currentTool?.input?.toolUseId ?? session.id,
                    approved: response === "approve" || response === "approve-once" || response === "approve-always",
                    answers: response.startsWith("deny") || response === "dismiss" ? null : { response },
                  });
                } catch { /* non-blocking */ }
              }}
              onJump={handleRowClick}
            />
          )}
          {!session.notifKind && session.state === "running" && session.currentTool && (
            <div className="session-row__detail-running">
              <span className="session-row__detail-label">Running</span>
              <span className="session-row__detail-tool">
                {session.currentTool.name}
              </span>
              {session.filePath && (
                <span className="session-row__detail-file">
                  {session.filePath}
                </span>
              )}
            </div>
          )}
          {!session.notifKind && isAttentionPhase(session.state) && (
            <div className="session-row__detail-waiting">
              <span className="session-row__detail-label">
                {session.state === "waitingForApproval"
                  ? "Awaiting approval"
                  : "Awaiting answer"}
              </span>
              {session.currentTool?.name && (
                <span className="session-row__detail-tool">
                  {session.currentTool.name}
                </span>
              )}
            </div>
          )}
          {!session.notifKind && session.state === "completed" && (
            <div className="session-row__detail-done">
              <span className="session-row__detail-label">Completed</span>
              {session.lastError && (
                <span className="session-row__detail-error">
                  {session.lastError}
                </span>
              )}
            </div>
          )}
          {session.state === "idle" && (
            <div className="session-row__detail-idle">
              <span className="session-row__detail-label">Idle</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
