import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AnimatedOverlay } from "../../components/AnimatedOverlay";
import { useConfigStore } from "../../store/config";
import { mockInvoke } from "../setup";

// 测试 B4-Lite 契约：
// 1. mount 时调一次 update_overlay_size(bbox) + set_overlay_region(compact 居中矩形)
// 2. state 切换不触发额外的 update_overlay_size（删除 onUpdate 每帧同步是 B4-Lite 核心）
// 3. region 矩形 = motion.div 目标尺寸在 bbox 内顶部居中（#root align-items: flex-start）

function resetTauriInternals() {
  // AnimatedOverlay 用 __TAURI_INTERNALS__ 判定是否在 Tauri 运行时。
  // jsdom 下 window.__TAURI_INTERNALS__ 直接赋值会被静默拒绝（property 不可写），
  // 必须 Object.defineProperty。
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: { invoke: mockInvoke },
    configurable: true,
    writable: true,
  });
}

function clearTauriInternals() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

// mockInvoke 签名是 () => Promise<void>，calls 被推为 []，需 unknown 中转
type InvokeCall = [command: string, args: unknown];
function invokeCalls(): InvokeCall[] {
  return mockInvoke.mock.calls as unknown as InvokeCall[];
}

function invokeCallNames(): string[] {
  return invokeCalls().map((c) => c[0]);
}

function findRegionCall(): { x: number; y: number; w: number; h: number } | null {
  const call = invokeCalls().find((c) => c[0] === "set_overlay_region");
  return call ? (call[1] as { x: number; y: number; w: number; h: number }) : null;
}

function findSizeCallDims(): { width: number; height: number } | null {
  const call = invokeCalls().find((c) => c[0] === "update_overlay_size");
  return call ? (call[1] as { width: number; height: number }) : null;
}

describe("AnimatedOverlay B4-Lite", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    resetTauriInternals();
    useConfigStore.setState({
      config: {
        ...useConfigStore.getState().config,
        ui: {
          ...useConfigStore.getState().config.ui,
          dimensions: { ...useConfigStore.getState().config.ui.dimensions, barHeight: 52 },
        },
      },
    });
  });

  afterEach(() => {
    clearTauriInternals();
  });

  it("mount 时调 update_overlay_size 把 HWND 撑到 bounding box（≥600×720）", async () => {
    render(
      <AnimatedOverlay isExpanded={false} data-testid="ao">
        <div>x</div>
      </AnimatedOverlay>,
    );
    await waitFor(() => {
      expect(findSizeCallDims()).not.toBeNull();
    });
    const dims = findSizeCallDims();
    expect(dims?.width).toBeGreaterThanOrEqual(600);
    expect(dims?.height).toBeGreaterThanOrEqual(720);
  });

  it("mount 时调 set_overlay_region 设为 compact 药丸矩形（顶部居中）", async () => {
    render(
      <AnimatedOverlay isExpanded={false} data-testid="ao">
        <div>x</div>
      </AnimatedOverlay>,
    );
    await waitFor(() => {
      expect(findRegionCall()).not.toBeNull();
    });
    const region = findRegionCall();
    // compact width 来自配置，barHeight=52；x = (bbox.w - compact.w)/2，y=0（flex-start）
    expect(region?.y).toBe(0);
    expect(region?.h).toBe(52);
    expect(region?.x).toBe(Math.max(0, (600 - region!.w) / 2));
  });

  it("B4-Lite 核心：state 切换不触发额外的 update_overlay_size（无 onUpdate 每帧同步）", () => {
    const { rerender } = render(
      <AnimatedOverlay isExpanded={false} data-testid="ao">
        <div>x</div>
      </AnimatedOverlay>,
    );
    mockInvoke.mockClear();

    // 切到 expanded（在 jsdom 下 framer-motion 不真动画，onAnimationComplete 可能不触发 ——
    // 关键是没有 onUpdate 每帧调 update_overlay_size）
    rerender(
      <AnimatedOverlay isExpanded={true} data-testid="ao">
        <div>x</div>
      </AnimatedOverlay>,
    );

    const sizeCalls = invokeCallNames().filter((n) => n === "update_overlay_size").length;
    // B4-Lite 下：state 切换本身不调 update_overlay_size（仅 init 和 onAnimationComplete 调）
    // jsdom 下 onAnimationComplete 不保证触发，所以 sizeCalls 应为 0
    expect(sizeCalls).toBe(0);
  });

  it("不在 Tauri 运行时不调用任何 invoke（浏览器预览）", () => {
    clearTauriInternals();
    render(
      <AnimatedOverlay isExpanded={false} data-testid="ao">
        <div>x</div>
      </AnimatedOverlay>,
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
