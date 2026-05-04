import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedOverlay } from "./AnimatedOverlay";
import { StatusDot } from "./StatusDot";
import { ApprovalPanel } from "./ApprovalPanel";
import { HookStatus } from "./HookStatus";
import { SettingsPanel } from "./SettingsPanel";
import { SessionDetail } from "./SessionDetail";
import { SessionList } from "./SessionList";
import { ActivityTimeline } from "./ActivityTimeline";
import { useSessionsStore } from "../store/sessions";
import { useConfigStore } from "../store/config";
import type { ApprovalRequest, Session } from "../store/sessions";
import "./Overlay.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

function clampOverlayHeight(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.ceil(value)));
}

function ApprovalFocusContent({
  approvalRequest,
  approvalSession,
  sessionsCount,
  onApprovalHandled,
}: {
  approvalRequest: ApprovalRequest;
  approvalSession: Session | null;
  sessionsCount: number;
  onApprovalHandled: () => void;
}) {
  return (
    <div className="overlay__approval-focus" data-testid="approval-focus">
      <div className="overlay__approval-context" data-testid="approval-context">
        <div className="overlay__approval-context-main">
          <span className="overlay__approval-context-label" title={approvalRequest.sessionLabel}>
            {approvalRequest.sessionLabel}
          </span>
          {approvalSession && (
            <span className="overlay__approval-context-state">{approvalSession.state}</span>
          )}
        </div>
        <span className="overlay__approval-context-count">
          {sessionsCount} session{sessionsCount === 1 ? "" : "s"}
        </span>
      </div>
      <ApprovalPanel
        key={approvalRequest.timestamp}
        request={approvalRequest}
        onApprovalHandled={onApprovalHandled}
      />
    </div>
  );
}

export function Overlay() {
  const { sessions, activeSessionId, setActiveSession, approvalRequest, clearApprovalRequest } = useSessionsStore();
  const config = useConfigStore((s) => s.config);
  const BAR_HEIGHT = config.ui.dimensions.barHeight;
  const EXPANDED_MIN = config.overlay.expandedMinHeight;
  const EXPANDED_MAX = config.overlay.expandedMaxHeight;
  const APPROVAL_FOCUS_HEIGHT = config.overlay.expandedMaxHeight;
  const EXPANDED_WIDTH = Math.max(config.overlay.expandedWidth, 600);
  const EXPANDED_BORDER_RADIUS = config.overlay.expandedBorderRadius;
  const active = sessions.find((s) => s.id === activeSessionId);
  const approvalStateSession = sessions.find((s) => s.state === "approval") ?? null;
  const approvalSession = approvalRequest
    ? sessions.find((s) => s.id === approvalRequest.sessionId) ?? null
    : approvalStateSession;
  const approvalStateFocusKey = approvalStateSession ? `session:${approvalStateSession.id}` : null;
  const approvalFocusKey = approvalRequest ? `request:${approvalRequest.toolUseId}` : approvalStateFocusKey;
  const [expanded, setExpanded] = useState(false);
  const [collapsedApprovalFocusKey, setCollapsedApprovalFocusKey] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const viewingSession = viewingSessionId ? sessions.find((s) => s.id === viewingSessionId) ?? null : null;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hadApprovalRequestRef = useRef(false);
  const handledApprovalStateFocusKeyRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(EXPANDED_MAX as number);

  // Note: approval_request events are handled by useAgentEvents hook
  // which sets the approvalRequest in the store

  // Auto-expand when approval request comes in
  useEffect(() => {
    if (approvalFocusKey) {
      if (approvalFocusKey === handledApprovalStateFocusKeyRef.current) {
        return;
      }

      hadApprovalRequestRef.current = true;
      setCollapsedApprovalFocusKey(null);
      const frame = window.requestAnimationFrame(() => setExpanded(true));
      return () => window.cancelAnimationFrame(frame);
    }

    handledApprovalStateFocusKeyRef.current = null;
    setCollapsedApprovalFocusKey(null);
    if (hadApprovalRequestRef.current) {
      hadApprovalRequestRef.current = false;
      setExpanded(false);
    }
  }, [approvalFocusKey, approvalRequest]);

  // Keep the capsule clickable in compact mode. The smaller compact footprint
  // replaces the old click-through behavior.
  useEffect(() => {
    invoke("set_window_interactive", { interactive: true }).catch(() => {});
  }, []);

  // Removed sessions clear detail view
  useEffect(() => {
    if (viewingSessionId && !sessions.find((s) => s.id === viewingSessionId)) {
      setViewingSessionId(null);
    }
  }, [sessions, viewingSessionId]);

  const handleSessionClick = useCallback(async (session: Session) => {
    setActiveSession(session.id);
    setError(null);

    if (expanded) {
      setViewingSessionId((prev) => (prev === session.id ? null : session.id));
    }

    if (session.pid) {
      setIsLoading(true);
      try {
        await invoke<FocusResult>("focus_session_window", { sessionPid: session.pid });
      } catch (e) {
        setError(`Failed to focus window: ${e}`);
      } finally {
        setIsLoading(false);
      }
    }
  }, [setActiveSession, expanded]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, activeSessionId, setActiveSession]);

  const clearError = useCallback(() => { setError(null); }, []);

  const isApprovalFocusMode = Boolean(approvalFocusKey);
  const isApprovalManuallyCollapsed = approvalFocusKey !== null && collapsedApprovalFocusKey === approvalFocusKey;
  const isOverlayExpanded = (expanded || isApprovalFocusMode) && !isApprovalManuallyCollapsed;
  const shouldUseAdaptiveHeight = !isApprovalFocusMode && !showSettings && !showActivity;
  const overlayExpandedHeight = isApprovalFocusMode
    ? APPROVAL_FOCUS_HEIGHT
    : shouldUseAdaptiveHeight
      ? measuredHeight
      : EXPANDED_MAX;

  // Bring overlay to foreground when it expands for approval focus mode.
  // This is needed so the overlay window receives WM_MOUSEWHEEL events,
  // which Windows routes to the foreground/focus window — not the window under the cursor.
  useEffect(() => {
    if (isOverlayExpanded && isApprovalFocusMode) {
      invoke("set_window_interactive", { interactive: true }).catch(() => {});
    }
  }, [isOverlayExpanded, isApprovalFocusMode]);

  useEffect(() => {
    if (!isOverlayExpanded || !isApprovalFocusMode) return;

    const syncApprovalSize = () => {
      invoke("update_overlay_size", {
        width: EXPANDED_WIDTH,
        height: APPROVAL_FOCUS_HEIGHT,
        webviewScaleFactor: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1,
        borderRadius: EXPANDED_BORDER_RADIUS,
        anchorCenter: true,
      }).catch(() => {});
    };

    syncApprovalSize();
    const firstRetry = window.setTimeout(syncApprovalSize, 80);
    const secondRetry = window.setTimeout(syncApprovalSize, 240);

    return () => {
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);
    };
  }, [isOverlayExpanded, isApprovalFocusMode]);

  // Non-approval panels use ResizeObserver-based adaptive height. Approval,
  // question, and plan focus mode stays fixed at 600x720 in Tauri to avoid
  // WebView/native resize mismatches that can hide action buttons.
  useEffect(() => {
    if (!isOverlayExpanded || isApprovalFocusMode || !panelRef.current) return;

    const panel = panelRef.current;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        const p = panelRef.current;
        const contentH = p.scrollHeight;
        const next = clampOverlayHeight(BAR_HEIGHT + contentH, EXPANDED_MIN, EXPANDED_MAX);
        setMeasuredHeight((h) => (Math.abs(h - next) < 1 ? h : next));
      });
    };

    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(panel);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [isOverlayExpanded, isApprovalFocusMode, approvalRequest, showSettings, showActivity, sessions.length, viewingSessionId]);

  const handleApprovalHandled = () => {
    handledApprovalStateFocusKeyRef.current = approvalRequest ? `session:${approvalRequest.sessionId}` : approvalStateFocusKey;
    setCollapsedApprovalFocusKey(handledApprovalStateFocusKeyRef.current);
    clearApprovalRequest();
    setExpanded(false);
  };

  const handleBarClick = () => {
    if (approvalFocusKey) {
      if (isOverlayExpanded) {
        setCollapsedApprovalFocusKey(approvalFocusKey);
        setExpanded(false);
      } else {
        setCollapsedApprovalFocusKey(null);
        setExpanded(true);
      }
      return;
    }

    setExpanded((value) => !value);
  };

  return (
    <AnimatedOverlay
      className={`overlay ${isOverlayExpanded ? "overlay--expanded" : "overlay--compact"}${isApprovalFocusMode ? " overlay--approval-mode" : ""}`}
      data-testid="overlay"
      isExpanded={isOverlayExpanded}
      expandedHeight={isOverlayExpanded ? overlayExpandedHeight : undefined}
    >
      <div className="overlay__shell">
        <div className="overlay__bar" data-testid="status-bar" onClick={handleBarClick}>
          {isLoading && <span className="overlay__spinner" />}
          {active ? (
            <>
              <StatusDot state={active.state} data-testid="status-dot" />
              <div className="overlay__label-group">
                <span className="overlay__label" data-testid="session-label" title={active.title || active.label}>
                  {active.title || active.label}
                </span>
                {active.title && (
                  <span className="overlay__sublabel">{active.label}</span>
                )}
              </div>
              <span className="overlay__state" data-testid="session-state">{active.state}</span>
            </>
          ) : (
            <span className="overlay__label overlay__label--empty" data-testid="empty-state">No active sessions</span>
          )}
          <HookStatus data-testid="hook-status" />
        </div>

        <AnimatePresence initial={false}>
          {isOverlayExpanded && (
            <motion.div
              className="overlay__panel"
              ref={panelRef}
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
              {isApprovalFocusMode && approvalRequest ? (
                <ApprovalFocusContent
                  approvalRequest={approvalRequest}
                  approvalSession={approvalSession}
                  sessionsCount={sessions.length}
                  onApprovalHandled={handleApprovalHandled}
                />
              ) : showSettings ? (
                <SettingsPanel />
              ) : showActivity ? (
                <ActivityTimeline data-testid="activity-timeline" />
              ) : (
                <>
                  {approvalRequest && (
                    <ApprovalPanel key={approvalRequest.timestamp} request={approvalRequest} onApprovalHandled={handleApprovalHandled} />
                  )}
                  {viewingSession ? (
                    <SessionDetail session={viewingSession} onBack={() => setViewingSessionId(null)} data-testid="session-detail" />
                  ) : (
                    <SessionList
                      sessions={sessions}
                      activeSessionId={activeSessionId}
                      viewingSessionId={viewingSessionId}
                      onSessionClick={handleSessionClick}
                      data-testid="sessions-list"
                    />
                  )}
                </>
              )}
              {!isApprovalFocusMode && (
                <div className="overlay__panel-footer">
                  <button
                    className="overlay__settings-btn"
                    data-testid="settings-btn"
                    onClick={() => { setShowSettings(!showSettings); setShowActivity(false); setViewingSessionId(null); }}
                  >
                    {showSettings ? "← Back" : "⚙ Settings"}
                  </button>
                  <button
                    className="overlay__settings-btn"
                    data-testid="activity-btn"
                    onClick={() => { setShowActivity(!showActivity); setShowSettings(false); setViewingSessionId(null); }}
                  >
                    {showActivity ? "← Back" : "📊 Activity"}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedOverlay>
  );
}
