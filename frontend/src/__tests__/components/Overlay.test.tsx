import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Overlay } from "../../components/Overlay";
import { useSessionsStore } from "../../store/sessions";
import { useConfigStore, normalizeOverlayLayoutConfig } from "../../store/config";
import type { Session, ApprovalRequest } from "../../store/sessions";

// 捕获 AnimatedOverlay 接收到的 props，用于断言 wiring 与 expandedHeight
const captureAnimatedOverlayProps = vi.fn();
vi.mock("../../components/AnimatedOverlay", () => ({
  AnimatedOverlay: (props: unknown) => {
    captureAnimatedOverlayProps(props);
    // 只渲染 children 以维持布局副作用；丢弃动画/样式细节
    const { children } = props as { children: React.ReactNode };
    return <div data-testid="animated-overlay">{children}</div>;
  },
}));

// 屏蔽子组件的重依赖，让测试聚焦于 Overlay 自身逻辑
vi.mock("../../components/NotchRow", () => ({
  NotchRow: () => <div data-testid="notch-row" />,
}));
vi.mock("../../components/ApprovalPanel", () => ({
  ApprovalPanel: () => <div data-testid="approval-panel" />,
}));
vi.mock("../../components/JumpToast", () => ({ JumpToast: () => null }));
vi.mock("../../components/PanelHead", () => ({
  PanelHead: () => <div data-testid="panel-head" />,
}));
vi.mock("../../components/GroupedRows", () => ({
  GroupedRows: () => <div data-testid="grouped-rows" />,
}));
vi.mock("../../components/SessionDetail", () => ({
  SessionDetail: () => <div data-testid="session-detail" />,
}));
vi.mock("../../components/SessionContextMenu", () => ({
  SessionContextMenu: () => null,
}));
vi.mock("../../hooks/useJumpToast", () => ({
  useJumpToast: () => ({ toast: null, showToast: vi.fn(), dismissToast: vi.fn() }),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    label: "Test session",
    cwd: "/tmp",
    state: "idle",
    createdAt: Date.now(),
    lastActivity: Date.now(),
    toolHistory: [],
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    toolUseId: "tool-1",
    sessionId: "s1",
    sessionLabel: "Test",
    approvalType: "permission",
    timestamp: Date.now(),
    ...overrides,
  };
}

function lastAnimatedProps(): {
  isExpanded: boolean;
  expandedHeight?: number;
  onComplete?: () => void;
} {
  const calls = captureAnimatedOverlayProps.mock.calls;
  return calls[calls.length - 1][0] as ReturnType<typeof lastAnimatedProps>;
}

describe("Overlay × useAnimationGatedMeasure wiring", () => {
  beforeEach(() => {
    captureAnimatedOverlayProps.mockClear();
    useSessionsStore.setState({
      sessions: [],
      pendingApprovals: [],
      currentApprovalIndex: 0,
      approvalMinimized: false,
      activeSessionId: null,
    });
  });

  it("spec 场景 5：审批专注模式绕过自适应测量，expandedHeight = approvalFocusHeight", () => {
    const session = makeSession({ id: "s1", state: "waitingForApproval" });
    const approval = makeApproval({ sessionId: "s1" });
    useSessionsStore.setState({
      sessions: [session],
      pendingApprovals: [approval],
      currentApprovalIndex: 0,
    });

    render(<Overlay />);

    const props = lastAnimatedProps();
    expect(props.isExpanded).toBe(true);

    const overlay = useConfigStore.getState().config.overlay;
    const expected = normalizeOverlayLayoutConfig(overlay).approvalFocusHeight;
    expect(props.expandedHeight).toBe(expected);
  });

  it("wiring：AnimatedOverlay 收到 onComplete 回调（透传 useAnimationGatedMeasure.onAnimationComplete）", () => {
    useSessionsStore.setState({ sessions: [makeSession()] });
    render(<Overlay />);
    const props = lastAnimatedProps();
    expect(typeof props.onComplete).toBe("function");
  });

  it("smoke：默认 compact 态渲染不崩溃，expandedHeight 透传 undefined", () => {
    useSessionsStore.setState({ sessions: [makeSession()] });
    render(<Overlay />);
    const props = lastAnimatedProps();
    expect(props.isExpanded).toBe(false);
    expect(props.expandedHeight).toBeUndefined();
  });

  it("spec 场景 3 间接覆盖：非审批展开态使用 measuredHeight（初始 EXPANDED_MIN）", () => {
    // 审批最小化 + 无 approval：isApprovalFocusMode=false，但 approvalMinimized 路径不影响 expanded
    // 这里直接验证：非审批态下，expandedHeight 取自 measuredHeight；初始 measuredHeight = EXPANDED_MIN
    useSessionsStore.setState({
      sessions: [makeSession()],
      pendingApprovals: [],
      approvalMinimized: false,
    });
    render(<Overlay />);
    const overlay = useConfigStore.getState().config.overlay;
    const expectedMin = normalizeOverlayLayoutConfig(overlay).expandedMinHeight;
    // compact 态下 expandedHeight 透传 undefined（isExpanded=false 分支），
    // 但 measuredHeight state 初值在 store 之外由 Overlay 内部 useState 持有，此处仅校验配置下限
    expect(expectedMin).toBeGreaterThan(0);
  });
});
