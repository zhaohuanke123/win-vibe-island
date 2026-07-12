import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnimationGatedMeasure } from "../../hooks/useAnimationGatedMeasure";

describe("useAnimationGatedMeasure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spec 场景 1：动画飞行中 gatedMeasure 不调用 measure", () => {
    const measure = vi.fn();
    const { result, rerender } = renderHook(
      ({ isExpanded }: { isExpanded: boolean }) =>
        useAnimationGatedMeasure(measure, isExpanded),
      { initialProps: { isExpanded: false } },
    );

    // false → true：动画启动，gate 置位
    rerender({ isExpanded: true });
    expect(result.current.isAnimatingRef.current).toBe(true);

    // 模拟 ResizeObserver 在动画期间多次触发
    act(() => {
      result.current.gatedMeasure();
      result.current.gatedMeasure();
      result.current.gatedMeasure();
    });
    expect(measure).not.toHaveBeenCalled();
  });

  it("spec 场景 2：onAnimationComplete 复位 gate 并触发一次 measure", async () => {
    const measure = vi.fn();
    const { result, rerender } = renderHook(
      ({ isExpanded }: { isExpanded: boolean }) =>
        useAnimationGatedMeasure(measure, isExpanded),
      { initialProps: { isExpanded: false } },
    );
    rerender({ isExpanded: true });

    act(() => {
      result.current.onAnimationComplete();
    });
    expect(result.current.isAnimatingRef.current).toBe(false);

    // 异步一帧后才触发 measure（rAF，fake timers 下需推进 ≥16ms）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(measure).toHaveBeenCalledTimes(1);

    // 后续 ResizeObserver 触发恢复正常穿透
    act(() => {
      result.current.gatedMeasure();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("spec 场景 4：收起（isExpanded→false）复位 gate，恢复测量", () => {
    const measure = vi.fn();
    const { result, rerender } = renderHook(
      ({ isExpanded }: { isExpanded: boolean }) =>
        useAnimationGatedMeasure(measure, isExpanded),
      { initialProps: { isExpanded: true } },
    );
    expect(result.current.isAnimatingRef.current).toBe(true);

    // 收起
    rerender({ isExpanded: false });
    expect(result.current.isAnimatingRef.current).toBe(false);

    // gatedMeasure 穿透到 measure
    act(() => {
      result.current.gatedMeasure();
    });
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("安全兜底：动画回调未触发时，1500ms 后强制复位 gate", () => {
    const measure = vi.fn();
    const { result, rerender } = renderHook(
      ({ isExpanded }: { isExpanded: boolean }) =>
        useAnimationGatedMeasure(measure, isExpanded),
      { initialProps: { isExpanded: false } },
    );
    rerender({ isExpanded: true });
    expect(result.current.isAnimatingRef.current).toBe(true);

    // 不调用 onAnimationComplete，直接推进到兜底超时
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.isAnimatingRef.current).toBe(false);

    // 兜底释放后 gatedMeasure 可穿透
    act(() => {
      result.current.gatedMeasure();
    });
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("支持自定义 safetyTimeoutMs", () => {
    const measure = vi.fn();
    const { result, rerender } = renderHook(
      ({ isExpanded }: { isExpanded: boolean }) =>
        useAnimationGatedMeasure(measure, isExpanded, { safetyTimeoutMs: 500 }),
      { initialProps: { isExpanded: false } },
    );
    rerender({ isExpanded: true });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.isAnimatingRef.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isAnimatingRef.current).toBe(false);
  });

  it("measure 引用更新后，gatedMeasure 调用的是最新版本", () => {
    const measure1 = vi.fn();
    const measure2 = vi.fn();
    const { result, rerender } = renderHook(
      ({ isExpanded, measure }: { isExpanded: boolean; measure: () => void }) =>
        useAnimationGatedMeasure(measure, isExpanded),
      { initialProps: { isExpanded: false, measure: measure1 } },
    );

    // 收起态下 gatedMeasure 穿透到 measure1
    act(() => {
      result.current.gatedMeasure();
    });
    expect(measure1).toHaveBeenCalledTimes(1);

    // 切换 measure 引用
    rerender({ isExpanded: false, measure: measure2 });
    act(() => {
      result.current.gatedMeasure();
    });
    expect(measure2).toHaveBeenCalledTimes(1);
    expect(measure1).toHaveBeenCalledTimes(1); // 不再被调用
  });
});
