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
import { getToolDescription } from "../shared/tool-description";
import { useSessionsStore } from "../store/sessions";
import { normalizeOverlayLayoutConfig, useConfigStore } from "../store/config";
import { logger } from "../client/logger";
import type { ApprovalRequest, Session } from "../store/sessions";
import "./Overlay.css";
import "./ApprovalQueue.css";

type FocusResult = "Success" | "FlashOnly" | "NotFound" | "Restored";

function clampOverlayHeight(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.ceil(value)));
}

function reportTauriError(context: string, error: unknown) {
  logger.warn("TAURI_IPC_ERROR", context, { error: String(error) });
}

function ApprovalFocusContent({
  approvalRequest,
  approvalSession,
  sessionsCount,
  onApprovalHandled,
  queueInfo,
  onNavigatePrev,
  onNavigateNext,
}: {
  approvalRequest: ApprovalRequest;
  approvalSession: Session | null;
  sessionsCount: number;
  onApprovalHandled: () => void;
  queueInfo?: { current: number; total: number };
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
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
        <div className="overlay__approval-context-right">
          {queueInfo && queueInfo.total > 1 && (
            <div className="approval-queue-nav">
              <button
                className="approval-queue-nav__btn"
                onClick={onNavigatePrev}
                disabled={!onNavigatePrev}
                title="Previous approval"
              >
                ‹
              </button>
              <span className="approval-queue-nav__counter">
                {queueInfo.current}/{queueInfo.total}
              </span>
              <button
                className="approval-queue-nav__btn"
                onClick={onNavigateNext}
                disabled={!onNavigateNext}
                title="Next approval"
              >
                ›
              </button>
            </div>
          )}
          <span className="overlay__approval-context-count">
            {sessionsCount} session{sessionsCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <ApprovalPanel
        key={approvalRequest.toolUseId}
        request={approvalRequest}
        onApprovalHandled={onApprovalHandled}
      />
    </div>
  );
}

export function Overlay() {
  const sessions = useSessionsStore((s) => s.sessions);
  const activeSessionId = useSessionsStore((s) => s.activeSessionId);
  const setActiveSession = useSessionsStore((s) => s.setActiveSession);
  const pendingApprovals = useSessionsStore((s) => s.pendingApprovals);
  const currentApprovalIndex = useSessionsStore((s) => s.currentApprovalIndex);
  const removeCurrentApproval = useSessionsStore((s) => s.removeCurrentApproval);
  const setCurrentApprovalIndex = useSessionsStore((s) => s.setCurrentApprovalIndex);
  const groups = useSessionsStore((s) => s.groups);
  const config = useConfigStore((s) => s.config);
  const overlayLayout = normalizeOverlayLayoutConfig(config.overlay);
  const BAR_HEIGHT = config.ui.dimensions.barHeight;
  const EXPANDED_MIN = overlayLayout.expandedMinHeight;
  const EXPANDED_MAX = overlayLayout.expandedMaxHeight;
  const APPROVAL_FOCUS_WIDTH = overlayLayout.approvalFocusWidth;
  const APPROVAL_FOCUS_HEIGHT = overlayLayout.approvalFocusHeight;
  const EXPANDED_BORDER_RADIUS = overlayLayout.expandedBorderRadius;
  const active = sessions.find((s) => s.id === activeSessionId);
  const approvalStateSession = sessions.find((s) => s.state === "approval") ?? null;
  const currentApproval = pendingApprovals[currentApprovalIndex] ?? null;
  const approvalSession = currentApproval
    ? sessions.find((s) => s.id === currentApproval.sessionId) ?? null
    : approvalStateSession;
  const approvalStateFocusKey = approvalStateSession ? `session:${approvalStateSession.id}` : null;
  const approvalFocusKey = currentApproval ? `request:${currentApproval.toolUseId}` : approvalStateFocusKey;
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
  // which adds to pendingApprovals in the store

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
  }, [approvalFocusKey, currentApproval]);

  // Notification + taskbar flash when approval arrives and window not focused
  const notificationsEnabled = useConfigStore((s) => s.notificationsEnabled ?? true);
  useEffect(() => {
    if (!currentApproval || !approvalFocusKey) return;
    if (!notificationsEnabled) return;

    // Taskbar flash
    void invoke("flash_taskbar").catch(() => {});

    // Web Notification API (works in Tauri WebView2)
    if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") {
      const tool = currentApproval.toolName || "approval";
      try {
        new Notification("Claude Code needs approval", {
          body: `${currentApproval.sessionLabel} — ${tool}`,
          icon: undefined,
          tag: `vibe-approval-${currentApproval.toolUseId}`,
        });
      } catch {
        // Notification blocked or not supported
      }
    }
  }, [currentApproval, approvalFocusKey, notificationsEnabled]);

  // Request notification permission on first mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Keep the capsule clickable in compact mode. The smaller compact footprint
  // replaces the old click-through behavior.
  useEffect(() => {
    invoke("set_window_interactive", { interactive: true }).catch((e) => {
      reportTauriError("failed to set window interactive mode", e);
    });
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
      invoke("set_window_interactive", { interactive: true }).catch((e) => {
        reportTauriError("failed to focus overlay for approval", e);
      });
    }
  }, [isOverlayExpanded, isApprovalFocusMode]);

  useEffect(() => {
    if (!isOverlayExpanded || !isApprovalFocusMode) return;

    const syncApprovalSize = () => {
      invoke("update_overlay_size", {
        width: APPROVAL_FOCUS_WIDTH,
        height: APPROVAL_FOCUS_HEIGHT,
        webviewScaleFactor: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1,
        borderRadius: EXPANDED_BORDER_RADIUS,
        anchorCenter: true,
      }).catch((e) => {
        reportTauriError("failed to sync approval focus size", e);
      });
    };

    syncApprovalSize();
    const firstRetry = window.setTimeout(syncApprovalSize, 80);
    const secondRetry = window.setTimeout(syncApprovalSize, 240);

    return () => {
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);
    };
  }, [isOverlayExpanded, isApprovalFocusMode, APPROVAL_FOCUS_WIDTH, APPROVAL_FOCUS_HEIGHT, EXPANDED_BORDER_RADIUS]);

  // Non-approval panels use ResizeObserver-based adaptive height. Approval,
  // question, and plan focus mode stays fixed at 600x720 in Tauri to avoid
  // WebView/native resize mismatches that can hide action buttons.
  useEffect(() => {
    if (!isOverlayExpanded || isApprovalFocusMode || showSettings || showActivity || !panelRef.current) return;

    const panel = panelRef.current;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        const p = panelRef.current;
        // Temporarily remove height constraint to measure natural content height
        // and avoid circular measurement where scrollHeight reflects the
        // stretched CSS height instead of actual content.
        const saved = p.style.height;
        p.style.height = 'auto';
        const contentH = p.scrollHeight;
        p.style.height = saved;
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
  }, [
    isOverlayExpanded,
    isApprovalFocusMode,
    currentApproval,
    showSettings,
    showActivity,
    sessions.length,
    viewingSessionId,
    BAR_HEIGHT,
    EXPANDED_MIN,
    EXPANDED_MAX,
  ]);

  const handleApprovalHandled = () => {
    const resolvedKey = currentApproval ? `session:${currentApproval.sessionId}` : approvalStateFocusKey;
    handledApprovalStateFocusKeyRef.current = resolvedKey;
    setCollapsedApprovalFocusKey(resolvedKey);
    removeCurrentApproval();
    // Only collapse if no more approvals remain
    if (pendingApprovals.length <= 1) {
      setExpanded(false);
    }
  };

  const handleNavigatePrev = () => {
    if (currentApprovalIndex > 0) {
      setCurrentApprovalIndex(currentApprovalIndex - 1);
    }
  };

  const handleNavigateNext = () => {
    if (currentApprovalIndex < pendingApprovals.length - 1) {
      setCurrentApprovalIndex(currentApprovalIndex + 1);
    }
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
                {active.currentTool && (
                  <span className="overlay__tool-context" data-testid="tool-context">
                    {getToolDescription(active.currentTool.name, active.currentTool.input)}
                  </span>
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
              {isApprovalFocusMode && currentApproval ? (
                <ApprovalFocusContent
                  approvalRequest={currentApproval}
                  approvalSession={approvalSession}
                  sessionsCount={sessions.length}
                  onApprovalHandled={handleApprovalHandled}
                  queueInfo={pendingApprovals.length > 1 ? { current: currentApprovalIndex + 1, total: pendingApprovals.length } : undefined}
                  onNavigatePrev={pendingApprovals.length > 1 && currentApprovalIndex > 0 ? handleNavigatePrev : undefined}
                  onNavigateNext={pendingApprovals.length > 1 && currentApprovalIndex < pendingApprovals.length - 1 ? handleNavigateNext : undefined}
                />
              ) : showSettings ? (
                <SettingsPanel />
              ) : showActivity ? (
                <ActivityTimeline data-testid="activity-timeline" />
              ) : (
                <>
                  {currentApproval && (
                    <ApprovalPanel key={currentApproval.toolUseId} request={currentApproval} onApprovalHandled={handleApprovalHandled} />
                  )}
                  {viewingSession ? (
                    <SessionDetail session={viewingSession} onBack={() => setViewingSessionId(null)} data-testid="session-detail" />
                  ) : (
                    <SessionList
                      sessions={sessions}
                      activeSessionId={activeSessionId}
                      viewingSessionId={viewingSessionId}
                      onSessionClick={handleSessionClick}
                      onRenameSession={(id, label) => useSessionsStore.getState().renameSession(id, label)}
                      onDeleteSession={(id) => useSessionsStore.getState().removeSession(id)}
                      onSetSessionTag={(id, tag) => useSessionsStore.getState().setSessionTag(id, tag)}
                      onCreateGroup={(name) => useSessionsStore.getState().createGroup(name)}
                      groups={groups}
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
