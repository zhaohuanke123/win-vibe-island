/**
 * Tests for SessionDetail panel + SessionContextMenu restoration.
 *
 * Covers acceptance criteria:
 *  1. Detail button renders per session row (when onDetail provided)
 *  2. Clicking detail button calls onDetail without triggering onJump
 *  3. No detail button when onDetail is omitted
 *  4. Right-click triggers onContextMenu callback
 *  5. GroupedRows passes onDetail / onContextMenu through to SessionRow
 *  6. Overlay shows SessionDetail when viewingSessionId is set
 *  7. Overlay shows context menu on right-click
 *  8. Context menu rename updates session label
 *  9. Detail panel auto-closes when session is removed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SessionRow } from "../../components/SessionRow";
import { GroupedRows } from "../../components/GroupedRows";
import { Overlay } from "../../components/Overlay";
import { useSessionsStore } from "../../store/sessions";
import { useConfigStore } from "../../store/config";
import type { Session } from "../../store/sessions";
import type { AppConfig } from "../../store/config";

// ── Helpers ────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s-1",
    label: "test-project",
    title: "Test Project",
    cwd: "/home/user/test-project",
    state: "running",
    pid: 1234,
    createdAt: Date.now() - 60_000,
    lastActivity: Date.now(),
    currentTool: { name: "Read", input: { file: "src/App.tsx" }, startTime: Date.now() },
    toolHistory: [],
    agent: "claude",
    ...overrides,
  };
}

/** Full default config that satisfies the store shape */
const DEFAULT_TEST_CONFIG: AppConfig = {
  version: 3,
  hookServer: {
    port: 7878,
    approvalTimeoutSecs: 120,
    preToolTimeoutSecs: 30,
    permissionTimeoutSecs: 60,
    maxErrorLogs: 100,
  },
  pipeServer: {
    pipeName: "\\\\.\\pipe\\VibeIsland",
    retryIntervalMs: 10,
    bufferSize: 4096,
  },
  overlay: {
    defaultX: 100,
    defaultY: 100,
    compactWidth: 180,
    compactHeight: 32,
    expandedWidth: 600,
    expandedMinHeight: 400,
    expandedMaxHeight: 720,
    approvalFocusWidth: 600,
    approvalFocusHeight: 720,
    alpha: 240,
    compactBorderRadius: 16,
    expandedBorderRadius: 22,
    snapPosition: "top",
  },
  processWatcher: {
    pollIntervalMs: 5000,
    detectNodeClaude: true,
  },
  audio: {
    defaultSound: "hero",
  },
  ui: {
    stateColors: {
      idle: "#9a958a",
      running: "#6ea7ff",
      waitingForApproval: "#f4a4a4",
      waitingForAnswer: "#ffd58a",
      completed: "#6fb982",
    },
    animation: {
      runningDurationMs: 1000,
      waitingForApprovalDurationMs: 600,
      waitingForAnswerDurationMs: 600,
      spring: {
        expand: { stiffness: 170, damping: 20, mass: 0.8 },
        collapse: { stiffness: 380, damping: 32, mass: 0.7 },
        transition: { stiffness: 400, damping: 30, mass: 1.0 },
        micro: { stiffness: 200, damping: 22, mass: 0.8 },
      },
    },
    dimensions: {
      barHeight: 32,
      padding: 14,
      gap: 8,
      statusDotSize: 9,
    },
    stateIndicator: "dot",
    density: "comfortable",
  },
};

function resetConfigStore() {
  useConfigStore.setState({
    config: DEFAULT_TEST_CONFIG,
    isLoading: false,
    error: null,
    notificationsEnabled: false,
  });
}

function resetSessionsStore(sessions: Session[] = []) {
  useSessionsStore.setState({
    sessions,
    activeSessionId: sessions.length > 0 ? sessions[0].id : null,
    pendingApprovals: [],
    currentApprovalIndex: 0,
    groups: [],
    errorLogs: [],
    hookServerStatus: {
      connectionState: "unknown",
      port: 7878,
    },
  });
}

// ── SessionRow Tests ───────────────────────────────────────────────

describe("SessionRow", () => {
  const mockOnJump = vi.fn();
  const mockOnDetail = vi.fn();
  const mockOnContextMenu = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders detail button when onDetail is provided", () => {
    const session = makeSession();
    render(
      <SessionRow
        session={session}
        onJump={mockOnJump}
        onDetail={mockOnDetail}
      />
    );
    expect(screen.getByTestId("row-detail-btn")).toBeInTheDocument();
  });

  it("does NOT render detail button when onDetail is not provided", () => {
    const session = makeSession();
    render(
      <SessionRow
        session={session}
        onJump={mockOnJump}
      />
    );
    expect(screen.queryByTestId("row-detail-btn")).not.toBeInTheDocument();
  });

  it("calls onDetail when detail button clicked and does NOT call onJump", () => {
    const session = makeSession();
    render(
      <SessionRow
        session={session}
        onJump={mockOnJump}
        onDetail={mockOnDetail}
      />
    );

    const detailBtn = screen.getByTestId("row-detail-btn");
    fireEvent.click(detailBtn);

    expect(mockOnDetail).toHaveBeenCalledTimes(1);
    expect(mockOnDetail).toHaveBeenCalledWith(session);
    expect(mockOnJump).not.toHaveBeenCalled();
  });

  it("calls onJump when the row body is clicked", () => {
    const session = makeSession();
    render(
      <SessionRow
        session={session}
        onJump={mockOnJump}
        onDetail={mockOnDetail}
      />
    );

    const rowBody = screen.getByTestId("row-content");
    fireEvent.click(rowBody);

    expect(mockOnJump).toHaveBeenCalledTimes(1);
    expect(mockOnJump).toHaveBeenCalledWith(session);
  });

  it("fires onContextMenu callback on right-click", () => {
    const session = makeSession();
    render(
      <SessionRow
        session={session}
        onContextMenu={mockOnContextMenu}
      />
    );

    const row = screen.getByTestId("session-row");
    fireEvent.contextMenu(row);

    expect(mockOnContextMenu).toHaveBeenCalledTimes(1);
    expect(mockOnContextMenu).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
  });
});

// ── GroupedRows Tests ──────────────────────────────────────────────

describe("GroupedRows", () => {
  const mockOnJump = vi.fn();
  const mockOnDetail = vi.fn();
  const mockOnContextMenu = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes onDetail through to SessionRow", () => {
    const session = makeSession({ id: "s-1" });
    render(
      <GroupedRows
        sessions={[session]}
        groupBy="none"
        sortBy="updated"
        onJump={mockOnJump}
        onDetail={mockOnDetail}
      />
    );

    // Should render the detail button, proving onDetail was passed down
    expect(screen.getByTestId("row-detail-btn")).toBeInTheDocument();

    // Click it and verify it calls our callback
    fireEvent.click(screen.getByTestId("row-detail-btn"));
    expect(mockOnDetail).toHaveBeenCalledWith(session);
  });

  it("passes onContextMenu through to SessionRow", () => {
    const session = makeSession({ id: "s-2" });
    render(
      <GroupedRows
        sessions={[session]}
        groupBy="none"
        sortBy="updated"
        onJump={mockOnJump}
        onContextMenu={mockOnContextMenu}
      />
    );

    // In flat mode, the row uses testid="flat-row", but the inner session-row
    // div still has data-session-id. Find by that attribute.
    const row = document.querySelector('[data-session-id="s-2"]')!;
    fireEvent.contextMenu(row);

    expect(mockOnContextMenu).toHaveBeenCalledTimes(1);
  });

  it("renders detail buttons for grouped sessions (groupBy=state)", () => {
    const s1 = makeSession({ id: "s-1", state: "running" });
    const s2 = makeSession({ id: "s-2", state: "idle" });

    render(
      <GroupedRows
        sessions={[s1, s2]}
        groupBy="state"
        sortBy="attention"
        onJump={mockOnJump}
        onDetail={mockOnDetail}
        onContextMenu={mockOnContextMenu}
      />
    );

    // Both sessions should have detail buttons
    const detailBtns = screen.getAllByTestId("row-detail-btn");
    expect(detailBtns.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Overlay SessionDetail & ContextMenu Integration ────────────────

describe("Overlay — SessionDetail and ContextMenu integration", () => {
  let originalWindowPrompt: typeof window.prompt;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowPrompt = window.prompt;
    resetConfigStore();
    resetSessionsStore();
  });

  afterEach(() => {
    window.prompt = originalWindowPrompt;
  });

  it("shows SessionDetail when a session is clicked via detail button", async () => {
    const session = makeSession({ id: "s-1" });
    resetSessionsStore([session]);

    render(<Overlay />);

    // Expand the overlay by clicking the bar
    const bar = screen.getByTestId("status-bar");
    await act(async () => {
      fireEvent.click(bar);
    });

    // Find and click the detail button
    const detailBtn = screen.getByTestId("row-detail-btn");
    await act(async () => {
      fireEvent.click(detailBtn);
    });

    // SessionDetail should be visible
    expect(screen.getByTestId("session-detail")).toBeInTheDocument();
    expect(screen.getByText("← Back")).toBeInTheDocument();
  });

  it("returns from SessionDetail when Back button is clicked", async () => {
    const session = makeSession({ id: "s-1" });
    resetSessionsStore([session]);

    render(<Overlay />);

    // Expand overlay
    await act(async () => {
      fireEvent.click(screen.getByTestId("status-bar"));
    });

    // Open detail
    await act(async () => {
      fireEvent.click(screen.getByTestId("row-detail-btn"));
    });
    expect(screen.getByTestId("session-detail")).toBeInTheDocument();

    // Click Back
    await act(async () => {
      fireEvent.click(screen.getByTestId("detail-back-btn"));
    });

    // Detail should be gone, session list should be back
    expect(screen.queryByTestId("session-detail")).not.toBeInTheDocument();
  });

  it("auto-closes SessionDetail when session is removed", async () => {
    const session = makeSession({ id: "s-1" });
    resetSessionsStore([session]);

    render(<Overlay />);

    // Expand and open detail
    await act(async () => {
      fireEvent.click(screen.getByTestId("status-bar"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("row-detail-btn"));
    });
    expect(screen.getByTestId("session-detail")).toBeInTheDocument();

    // Remove the session from store
    await act(async () => {
      useSessionsStore.setState({ sessions: [] });
    });

    // Detail panel should be auto-closed
    expect(screen.queryByTestId("session-detail")).not.toBeInTheDocument();
  });

  it("shows context menu on right-click of session row", async () => {
    const session = makeSession({ id: "s-1" });
    resetSessionsStore([session]);

    render(<Overlay />);

    // Expand overlay
    await act(async () => {
      fireEvent.click(screen.getByTestId("status-bar"));
    });

    // Right-click on session row
    const row = document.querySelector('[data-session-id="s-1"]')!;
    await act(async () => {
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 });
    });

    // Context menu should appear
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("context menu rename calls renameSession and updates label", async () => {
    const session = makeSession({ id: "s-1", label: "old-name" });
    resetSessionsStore([session]);

    // Mock window.prompt to return new name
    window.prompt = vi.fn().mockReturnValue("new-name");

    render(<Overlay />);

    // Expand overlay
    await act(async () => {
      fireEvent.click(screen.getByTestId("status-bar"));
    });

    // Right-click to open context menu
    const row = document.querySelector('[data-session-id="s-1"]')!;
    await act(async () => {
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 });
    });

    // Click Rename
    await act(async () => {
      fireEvent.click(screen.getByText("Rename"));
    });

    // Verify prompt was called
    expect(window.prompt).toHaveBeenCalledWith(
      "Rename session",
      expect.any(String)
    );

    // Verify store was updated
    const updatedSessions = useSessionsStore.getState().sessions;
    expect(updatedSessions[0].label).toBe("new-name");
  });

  it("context menu delete removes the session", async () => {
    const session = makeSession({ id: "s-1" });
    resetSessionsStore([session]);

    render(<Overlay />);

    // Expand overlay
    await act(async () => {
      fireEvent.click(screen.getByTestId("status-bar"));
    });

    // Right-click to open context menu
    const row = document.querySelector('[data-session-id="s-1"]')!;
    await act(async () => {
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 });
    });

    // Click Delete
    await act(async () => {
      fireEvent.click(screen.getByText("Delete"));
    });

    // Verify session was removed from store
    expect(useSessionsStore.getState().sessions).toHaveLength(0);
  });
});
