import { useCallback, useEffect, useRef } from "react";

/**
 * 动画期间冻结自适应高度测量回写。
 *
 * 反馈环切断器：原本 `ResizeObserver → measure() → setMeasuredHeight` 会在
 * Framer Motion 动画飞行中反复重写 `animate.height` 目标，导致弹簧轨迹被
 * 反复重新规划，肉眼表现为"抖一下、顿一下"。本 hook 用一个瞬态 ref 标志
 * 在动画飞行中 gate 掉 measure 调用，动画完成回调中解冻并主动测一次。
 *
 * 生命周期：
 * - `isExpanded` 由 false→true：置位 gate（动画启动前）
 * - `isExpanded` 由 true→false：复位 gate（覆盖收起路径，防止卡死）
 * - 调用 `onAnimationComplete`：复位 gate + 主动触发一次 measure（异步一帧，
 *   等 panel 子树完成动画末态布局后再读）
 * - 1500ms 安全兜底：Framer Motion 异常不触发完成回调时强制复位
 *
 * 返回的 `gatedMeasure` 直接喂给 `ResizeObserver` 回调；`onAnimationComplete`
 * 透传给 `AnimatedOverlay` 的 `onComplete` prop。
 */
export function useAnimationGatedMeasure(
  measure: () => void,
  isExpanded: boolean,
  options?: { safetyTimeoutMs?: number },
): {
  gatedMeasure: () => void;
  onAnimationComplete: () => void;
  isAnimatingRef: React.RefObject<boolean>;
} {
  const isAnimatingRef = useRef(false);
  const measureRef = useRef(measure);
  const safetyTimeoutMs = options?.safetyTimeoutMs ?? 1500;

  // 始终持有最新的 measure 引用，避免回调闭包过期
  useEffect(() => {
    measureRef.current = measure;
  }, [measure]);

  // 动画标志生命周期 + 安全兜底
  useEffect(() => {
    isAnimatingRef.current = isExpanded;
    if (!isExpanded) return;
    const safety = window.setTimeout(() => {
      isAnimatingRef.current = false;
    }, safetyTimeoutMs);
    return () => window.clearTimeout(safety);
  }, [isExpanded, safetyTimeoutMs]);

  // ResizeObserver 回调用：gate 关闭时直接跳过（既不读 layout 也不 setState）
  const gatedMeasure = useCallback(() => {
    if (isAnimatingRef.current) return;
    measureRef.current();
  }, []);

  // 动画完成回调：复位 gate + 异步一帧后触发一次测量
  const onAnimationComplete = useCallback(() => {
    isAnimatingRef.current = false;
    requestAnimationFrame(() => measureRef.current());
  }, []);

  return { gatedMeasure, onAnimationComplete, isAnimatingRef };
}
