import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedOverlay } from "./AnimatedOverlay";
import { NotchRow } from "./NotchRow";
import { ApprovalPanel } from "./ApprovalPanel";
import { JumpToast, useJumpToast } from "./JumpToast";
import { PanelHead } from "./PanelHead";
import { GroupedRows } from "./GroupedRows";
import { SessionDetail } from "./SessionDetail";
import { SessionContextMenu } from "./SessionContextMenu";
import type { GroupBy, SortBy } from "./GroupedRows";
import { isAttentionPhase } from "../shared/phase-colors";
import { useSessionsStore } from "../store/sessions";
import { normalizeOverlayLayoutConfig, useConfigStore } from "../store/config";
import { logger } from "../client/logger";
import type { ApprovalRequest, Session } from "../store/sessions";
import "./Overlay.css";
import "./ApprovalQueue.css";
import "./PanelHead.css";
import "./GroupedRows.css";
import "./SessionRow.css";
import "./Pill.css";
import "./NotchRow.css";

type JumpResult = "Success" | "AppActivated" | "NotFound" | "Failed";

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
  onBackToSessions,
}: {
  approvalRequest: ApprovalRequest;
  approvalSession: Session | null;
  sessionsCount: number;
  onApprovalHandled: () => void;
  queueInfo?: { current: number; total: number };
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  onBackToSessions?: () => void;
}) {
  return (
    <div className="overlay__approval-focus" data-testid="approval-focus">
      <div className="overlay__approval-context" data-testid="approval-context">
        <div className="overlay__approval-context-main">
          {onBackToSessions && (
            <button
              className="approval-queue-nav__btn"
              onClick={onBackToSessions}
              title="Back to session list"
              style={{ marginRight: 6 }}
            >
              &#8592;
            </button>
          )}
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
  const approvalMinimized = useSessionsStore((s) => s.approvalMinimized);
  const minimizeApprovalPanel = useSessionsStore((s) => s.minimizeApprovalPanel);
  const restoreApprovalPanel = useSessionsStore((s) => s.restoreApprovalPanel);
  const config = useConfigStore((s) => s.config);
  const renameSession = useSessionsStore((s) => s.renameSession);
  const removeSession = useSessionsStore((s) => s.removeSession);
  const setSessionTag = useSessionsStore((s) => s.setSessionTag);
  const createGroup = useSessionsStore((s) => s.createGroup);
  const groups = useSessionsStore((s) => s.groups);
  const overlayLayout = normalizeOverlayLayoutConfig(config.overlay);
  const density = config.ui.density;
  const BAR_HEIGHT = config.ui.dimensions.barHeight;
  const EXPANDED_MIN = overlayLayout.expandedMinHeight;
  const EXPANDED_MAX = overlayLayout.expandedMaxHeight;
  const APPROVAL_FOCUS_WIDTH = overlayLayout.approvalFocusWidth;
  const APPROVAL_FOCUS_HEIGHT = overlayLayout.approvalFocusHeight;
  const EXPANDED_BORDER_RADIUS = overlayLayout.expandedBorderRadius;
  const active = sessions.find((s) => s.id === activeSessionId);
  const approvalStateSession = sessions.find((s) => s.state === "waitingForApproval" || s.state === "waitingForAnswer") ?? null;
  const currentApproval = pendingApprovals[currentApprovalIndex] ?? null;
  const approvalSession = currentApproval
    ? sessions.find((s) => s.id === currentApproval.sessionId) ?? null
    : approvalStateSession;
  const approvalStateFocusKey = approvalStateSession ? `session:${approvalStateSession.id}` : null;
  const approvalFocusKey = currentApproval ? `request:${currentApproval.toolUseId}` : approvalStateFocusKey;
  const [expanded, setExpanded] = useState(false);
  const [collapsedApprovalFocusKey, setCollapsedApprovalFocusKey] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [snapPosition, setSnapPosition] = useState<"top" | "bottom" | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    session: Session;
    position: { x: number; y: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast: jumpToast, showToast: showJumpToast, dismissToast: dismissJumpToast } = useJumpToast();
  const hadApprovalRequestRef = useRef(false);
  const handledApprovalStateFocusKeyRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(EXPANDED_MIN as number);

  // v8 group sort state
  const [groupBy, setGroupBy] = useState<GroupBy>("state");
  const [sortBy, setSortBy] = useState<SortBy>("attention");

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

  // 新审批到达时自动恢复审批面板
  const prevPendingCountRef = useRef(pendingApprovals.length);
  useEffect(() => {
    if (pendingApprovals.length > prevPendingCountRef.current && approvalMinimized) {
      restoreApprovalPanel();
    }
    prevPendingCountRef.current = pendingApprovals.length;
  }, [pendingApprovals.length, approvalMinimized, restoreApprovalPanel]);

  // Notification + taskbar flash when approval arrives and window not focused
  const notificationsEnabled = useConfigStore((s) => s.notificationsEnabled ?? true);
  useEffect(() => {
    if (!currentApproval || !approvalFocusKey) return;
    if (!notificationsEnabled) return;
    void invoke("flash_taskbar").catch(() => {});
    if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") {
      const tool = currentApproval.toolName || "approval";
      try {
        new Notification("Claude Code needs approval", {
          body: `${currentApproval.sessionLabel} — ${tool}`,
          icon: undefined,
          tag: `vibe-approval-${currentApproval.toolUseId}`,
        });
      } catch { /* non-blocking */ }
    }
  }, [currentApproval, approvalFocusKey, notificationsEnabled]);

  // Request notification permission on first mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Keep the window interactive (clickable) always
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

  const handleJump = useCallback(async (session: Session) => {
    setActiveSession(session.id);
    setError(null);

    if (!session.pid && !session.jumpTarget) {
      // No terminal target — just mark active; user can use chevron for details
      return;
    }

    const terminalName = session.jumpTarget?.terminalApp || "Terminal";
    const sessionLabel = session.title || session.label;

    try {
      const result = await invoke<JumpResult>("focus_session_window", {
        sessionPid: session.pid ?? null,
        jumpTarget: session.jumpTarget ?? null,
        sessionCwd: session.cwd ?? null,
      });
      if (result === "NotFound" || result === "Failed") {
        showJumpToast(terminalName, sessionLabel, true);
      } else {
        showJumpToast(terminalName, sessionLabel);
      }
    } catch {
      showJumpToast(terminalName, sessionLabel, true);
    }
  }, [setActiveSession, showJumpToast]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, activeSessionId, setActiveSession]);

  const clearError = useCallback(() => { setError(null); }, []);

  const handleDetail = useCallback((session: Session) => {
    setViewingSessionId(session.id);
  }, []);

  const handleContextMenu = useCallback((session: Session, position: { x: number; y: number }) => {
    setContextMenu({ session, position });
  }, []);

  const handleContextMenuClose = useCallback(() => setContextMenu(null), []);

  const handleContextMenuRename = useCallback(() => {
    if (!contextMenu) return;
    const newName = window.prompt("Rename session", contextMenu.session.label || contextMenu.session.title || "");
    if (newName && newName.trim()) {
      renameSession(contextMenu.session.id, newName.trim());
    }
  }, [contextMenu, renameSession]);

  const isApprovalFocusMode = Boolean(approvalFocusKey) && !approvalMinimized;
  const isApprovalManuallyCollapsed = approvalFocusKey !== null && collapsedApprovalFocusKey === approvalFocusKey;
  const isOverlayExpanded = (expanded || Boolean(approvalFocusKey)) && !isApprovalManuallyCollapsed;
  const shouldUseAdaptiveHeight = !isApprovalFocusMode;
  const overlayExpandedHeight = isApprovalFocusMode
    ? APPROVAL_FOCUS_HEIGHT
    : shouldUseAdaptiveHeight
      ? measuredHeight
      : EXPANDED_MAX;

  // Bring overlay to foreground when it expands for approval focus mode
  useEffect(() => {
    if (isOverlayExpanded && isApprovalFocusMode) {
      invoke("set_window_interactive", { interactive: true }).catch((e) => {
        reportTauriError("failed to focus overlay for approval", e);
      });
    }
  }, [isOverlayExpanded, isApprovalFocusMode]);

  // Sync approval focus size
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

  // Adaptive height measurement for non-approval expanded mode
  useEffect(() => {
    if (!isOverlayExpanded || isApprovalFocusMode || !panelRef.current) return;

    const panel = panelRef.current;
    let raf = 0;

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        const p = panelRef.current;
        // 分层测量：chrome（固定部分）+ body（滚动内容区）
        let chromeH = 0;
        for (const child of Array.from(p.children)) {
          const el = child as HTMLElement;
          // 跳过滚动内容区，单独用 scrollHeight 测量
          if (el === listRef.current) continue;
          chromeH += el.offsetHeight || 0;
        }
        // 滚动内容区用 scrollHeight 读取完整内容高度（不受父级约束）
        const bodyH = listRef.current?.scrollHeight ?? 0;
        const contentH = chromeH + bodyH;
        const next = clampOverlayHeight(BAR_HEIGHT + contentH, EXPANDED_MIN, EXPANDED_MAX);
        setMeasuredHeight((h) => (Math.abs(h - next) < 1 ? h : next));
      });
    };

    // 延迟首帧测量，等 AnimatePresence 挂载完成
    const initTimer = setTimeout(() => measure(), 50);
    const observer = new ResizeObserver(() => measure());
    observer.observe(panel);
    // 同时观察滚动内容区，内容变化时重新测量
    const bindList = () => { if (listRef.current) observer.observe(listRef.current); };
    const bindTimer = setTimeout(bindList, 80);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(bindTimer);
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [
    isOverlayExpanded,
    isApprovalFocusMode,
    currentApproval,
    sessions.length,
    BAR_HEIGHT,
    EXPANDED_MIN,
    EXPANDED_MAX,
  ]);

  const handleApprovalHandled = () => {
    const resolvedKey = currentApproval ? `session:${currentApproval.sessionId}` : approvalStateFocusKey;
    handledApprovalStateFocusKeyRef.current = resolvedKey;
    setCollapsedApprovalFocusKey(resolvedKey);
    removeCurrentApproval();
    // 所有审批处理完后重置最小化状态
    if (pendingApprovals.length <= 1) {
      setExpanded(false);
      if (approvalMinimized) {
        useSessionsStore.getState().restoreApprovalPanel();
      }
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

  // ── Drag-to-snap: 前端 mousemove 驱动 + 后端 SetWindowPos 移动 ──
  const wasDraggedRef = useRef(false);
  const dragRafRef = useRef<number>(0);
  const dragStartScreenRef = useRef<{ x: number; y: number } | null>(null);
  // 用 ref 保存最新的 toggle 函数，避免 useEffect 闭包过期
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
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

  const handleBarMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStartScreenRef.current = { x: e.screenX, y: e.screenY };
    wasDraggedRef.current = false;
    invoke("start_manual_drag", {
      mouseX: Math.round(e.screenX * window.devicePixelRatio),
      mouseY: Math.round(e.screenY * window.devicePixelRatio),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStartScreenRef.current;
      if (!start) return;

      if (!wasDraggedRef.current) {
        const dx = e.screenX - start.x;
        const dy = e.screenY - start.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        wasDraggedRef.current = true;
        setSnapPosition(null);
      }

      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = requestAnimationFrame(() => {
        invoke("move_overlay_drag", {
          mouseX: Math.round(e.screenX * window.devicePixelRatio),
          mouseY: Math.round(e.screenY * window.devicePixelRatio),
        }).catch(() => {});
      });
    };

    const handleMouseUp = () => {
      if (!dragStartScreenRef.current) return;
      dragStartScreenRef.current = null;

      if (!wasDraggedRef.current) {
        // 纯点击，切换展开
        toggleRef.current();
        return;
      }

      // 拖拽结束，吸附到边缘
      cancelAnimationFrame(dragRafRef.current);
      invoke("end_manual_drag").catch(() => {});
      window.setTimeout(async () => {
        try {
          const result = await invoke<{ snapPosition: "top" | "bottom" | null }>("smart_snap_overlay");
          setSnapPosition(result.snapPosition ?? null);
        } catch {
          setSnapPosition(null);
        }
      }, 50);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      cancelAnimationFrame(dragRafRef.current);
    };
  }, []);

  // ── Notch row data ──
  const notchPhase = active?.state ?? "idle";
  const notchAgent = active?.agent ?? "claude";
  const notchPromptPreview = active?.lastPrompt
    ? (active.lastPrompt.length > 30 ? active.lastPrompt.slice(0, 30) + "…" : active.lastPrompt)
    : null;
  const notchLabel = active?.title ?? notchPromptPreview ?? active?.label ?? (sessions.length > 0
    ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
    : "No active sessions");

  // ── Filter sessions for expanded mode ──
  // Don't show idle/completed sessions that are stale in the "active" section
  const visibleSessions = sessions;
  const viewingSession = viewingSessionId
    ? sessions.find((s) => s.id === viewingSessionId) ?? null
    : null;

  return (
    <>
      <AnimatedOverlay
        className={`overlay overlay--v8 ${isOverlayExpanded ? "overlay--expanded" : "overlay--compact"}${isApprovalFocusMode ? " overlay--approval-mode" : ""}${snapPosition === "top" ? " overlay--snapped-top" : snapPosition === "bottom" ? " overlay--snapped-bottom" : ""}`}
        data-testid="overlay"
        isExpanded={isOverlayExpanded}
        expandedHeight={isOverlayExpanded ? overlayExpandedHeight : undefined}
        snapPosition={snapPosition}
      >
        <div className="overlay__shell pill" style={{ position: "relative" }}>
          {/* Jump Toast — non-blocking, pointer-events: none */}
          {jumpToast && (
            <JumpToast
              terminalName={jumpToast.terminalName}
              sessionLabel={jumpToast.sessionLabel}
              failed={jumpToast.failed}
              onDismiss={dismissJumpToast}
              data-testid="jump-toast"
            />
          )}

          {/* Notch / Compact bar — draggable pill with edge snapping */}
          <div
            className="overlay__bar pill__bar"
            data-testid="status-bar"

            onMouseDown={handleBarMouseDown}
          >
            <NotchRow
              phase={notchPhase}
              agent={notchAgent}
              label={notchLabel}
              rightSlot={
                <span className="notch-row__right">
                  {pendingApprovals.length > 0 && (
                    <span
                      className="notch-row__chip"
                      onClick={restoreApprovalPanel}
                      title="Click to review pending approvals"
                      style={{
                        background: "rgba(244, 164, 164, 0.2)",
                        color: "#f4a4a4",
                        cursor: "pointer",
                      }}
                    >
                      {pendingApprovals.length} pending
                    </span>
                  )}
                </span>
              }
              data-testid="notch-row"
            />
          </div>

          {/* Expanded panel */}
          <AnimatePresence initial={false}>
            {isOverlayExpanded && (
              <motion.div
                className="overlay__panel pill__body"
                ref={panelRef}
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.985 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {error && (
                  <div className="overlay__error" onClick={clearError}>
                    <span className="overlay__error-icon">!</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* 审批最小化提示条：点击回到审批面板 */}
                {!isApprovalFocusMode && approvalMinimized && pendingApprovals.length > 0 && (
                  <div
                    className="overlay__approval-banner"
                    onClick={restoreApprovalPanel}
                    data-testid="approval-banner"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "6px 12px",
                      background: "var(--accent-warn-bg, rgba(255, 193, 7, 0.12))",
                      borderBottom: "1px solid var(--line)",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "var(--accent-warn, #FFC107)",
                    }}
                  >
                    <span>&#9888;</span>
                    <span>
                      {pendingApprovals.length} pending approval{pendingApprovals.length > 1 ? "s" : ""}
                    </span>
                    <span style={{ marginLeft: "auto", opacity: 0.7 }}>&#8594; Review</span>
                  </div>
                )}

                {isApprovalFocusMode && currentApproval ? (
                  <ApprovalFocusContent
                    approvalRequest={currentApproval}
                    approvalSession={approvalSession}
                    sessionsCount={sessions.length}
                    onApprovalHandled={handleApprovalHandled}
                    onBackToSessions={minimizeApprovalPanel}
                    queueInfo={pendingApprovals.length > 1 ? { current: currentApprovalIndex + 1, total: pendingApprovals.length } : undefined}
                    onNavigatePrev={pendingApprovals.length > 1 && currentApprovalIndex > 0 ? handleNavigatePrev : undefined}
                    onNavigateNext={pendingApprovals.length > 1 && currentApprovalIndex < pendingApprovals.length - 1 ? handleNavigateNext : undefined}
                  />
                ) : viewingSession ? (
                  <SessionDetail
                    session={viewingSession}
                    onBack={() => setViewingSessionId(null)}
                    data-testid="session-detail"
                  />
                ) : (
                  <>
                    <PanelHead
                      sessions={sessions}
                      onSettingsClick={() => {
                        invoke("open_control_center").catch((e) => {
                          reportTauriError("failed to open control center", e);
                        });
                      }}
                      data-testid="panel-head"
                    />
                    <div className="panel-list" ref={listRef} data-testid="panel-list">
                      <div className="oi-list-controls" style={{
                        display: "flex",
                        gap: "6px",
                        padding: "4px 12px",
                      }}>
                        <select
                          className="oi-select"
                          value={groupBy}
                          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                          style={{
                            background: "transparent",
                            color: "var(--paper)",
                            border: "1px solid var(--line)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "10.5px",
                            fontFamily: "var(--font-ui)",
                          }}
                        >
                          <option value="state">Group: State</option>
                          <option value="agent">Group: Agent</option>
                          <option value="project">Group: Project</option>
                          <option value="none">No Group</option>
                        </select>
                        <select
                          className="oi-select"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortBy)}
                          style={{
                            background: "transparent",
                            color: "var(--paper)",
                            border: "1px solid var(--line)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "10.5px",
                            fontFamily: "var(--font-ui)",
                          }}
                        >
                          <option value="attention">By Attention</option>
                          <option value="updated">By Recent</option>
                        </select>
                      </div>
                      <GroupedRows
                        sessions={visibleSessions}
                        groupBy={groupBy}
                        sortBy={sortBy}
                        onJump={handleJump}
                        onDetail={handleDetail}
                        onContextMenu={handleContextMenu}
                        density={density}
                      />
                    </div>
                    {/* PanelFooter */}
                    <div className="panel-foot" data-testid="panel-foot" style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 12px",
                      borderTop: "1px solid var(--line)",
                      fontSize: "10.5px",
                      color: "var(--ink-soft)",
                      fontFamily: "var(--font-mono)",
                    }}>
                      <span className="panel-foot__summary">
                        {sessions.length} session{sessions.length === 1 ? "" : "s"}
                        {(() => {
                          const wc = sessions.filter(s => isAttentionPhase(s.state)).length;
                          return wc > 0 ? ` · ${wc} waiting` : "";
                        })()}
                      </span>
                      <span className="panel-foot__shortcut" style={{ opacity: 0.5 }}>
                        Ctrl+Alt+Space
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AnimatedOverlay>
      {contextMenu && (
        <SessionContextMenu
          session={contextMenu.session}
          position={contextMenu.position}
          groups={groups}
          onClose={handleContextMenuClose}
          onRename={handleContextMenuRename}
          onDelete={(id) => removeSession(id)}
          onSetTag={(id, tag) => setSessionTag(id, tag)}
          onCreateGroup={(name) => createGroup(name)}
        />
      )}
    </>
  );
}
