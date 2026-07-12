import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, type Transition } from "framer-motion";
import { OVERLAY_DIMENSIONS, SPRING_CONFIG } from "../config/animation";
import { Pill, type PillMode } from "./Pill";
import { logger } from "../client/logger";
import { deriveBoundingBox, normalizeOverlayLayoutConfig, useConfigStore } from "../store/config";
import { logAnimDiag } from "./anim-diag";
import type { UIPhase } from "../store/sessions";
import type { AgentType } from "../shared/agents";
import type { ReactNode } from "react";

interface AnimatedOverlayProps {
  isExpanded: boolean;
  expandedHeight?: number;
  className?: string;
  children: React.ReactNode;
  "data-testid"?: string;
  pillMode?: PillMode;
  pillPhase?: UIPhase;
  pillAgent?: AgentType;
  pillLabel?: string;
  pillNotchRightSlot?: ReactNode;
  onPillNotchClick?: () => void;
  snapPosition?: "top" | "bottom" | null;
  // 动画完成后回调（在内部 region/size 同步之后触发），
  // 供父组件解冻自适应测量等后处理使用
  onComplete?: () => void;
}

function getWebviewScaleFactor() {
  return Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
}

function reportIpcError(error: unknown) {
  logger.warn("TAURI_IPC_ERROR", "failed to sync overlay geometry", { error: String(error) });
}

export function AnimatedOverlay({
  isExpanded,
  expandedHeight,
  className,
  children,
  "data-testid": testId,
  pillMode,
  pillPhase,
  pillAgent,
  pillLabel,
  pillNotchRightSlot,
  onPillNotchClick,
  snapPosition,
  onComplete,
}: AnimatedOverlayProps) {
  // B4-Lite：HWND 恒定为 bounding box（max of all states），motion.div 保留 width/height 动画
  const config = useConfigStore((s) => s.config);
  const overlayLayout = normalizeOverlayLayoutConfig(config.overlay);
  const barHeight = config.ui.dimensions.barHeight;
  const bbox = deriveBoundingBox(overlayLayout, barHeight);

  const expandedDim = {
    ...OVERLAY_DIMENSIONS.expanded,
    height: expandedHeight ?? OVERLAY_DIMENSIONS.expanded.height,
  };
  const dimensions = isExpanded ? expandedDim : OVERLAY_DIMENSIONS.compact;

  const hasInitializedRef = useRef(false);
  const motionDivRef = useRef<HTMLDivElement | null>(null);

  const [wasExpanded, setWasExpanded] = useState(false);
  useEffect(() => {
    if (pillMode) return;
    const id = requestAnimationFrame(() => setWasExpanded(isExpanded));
    return () => cancelAnimationFrame(id);
  }, [isExpanded, pillMode]);

  // 启动时把 HWND 撑到 bounding box + 设初始 region（compact 药丸矩形）
  // 之后 HWND 尺寸恒定，正常使用中不再 resize（B4-Lite 核心）
  useEffect(() => {
    if (pillMode) return;
    if (!window.__TAURI_INTERNALS__) return;
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    invoke("update_overlay_size", {
      width: bbox.width,
      height: bbox.height,
      webviewScaleFactor: getWebviewScaleFactor(),
      borderRadius: overlayLayout.expandedBorderRadius,
      anchorCenter: true,
      snapPosition: snapPosition ?? null,
    }).catch(reportIpcError);

    const initialW = OVERLAY_DIMENSIONS.compact.width;
    const initialH = OVERLAY_DIMENSIONS.compact.height;
    invoke("set_overlay_region", {
      x: Math.max(0, (bbox.width - initialW) / 2),
      y: 0,
      w: initialW,
      h: initialH,
      webviewScaleFactor: getWebviewScaleFactor(),
    }).catch(reportIpcError);
  }, [pillMode, bbox.width, bbox.height, overlayLayout.expandedBorderRadius, snapPosition]);

  // Pill mode: delegate rendering to Pill component（在所有 hooks 之后）
  if (pillMode) {
    return (
      <Pill
        mode={pillMode}
        phase={pillPhase}
        agent={pillAgent}
        label={pillLabel}
        notchRightSlot={pillNotchRightSlot}
        onNotchClick={onPillNotchClick}
        data-testid={testId}
      >
        {children}
      </Pill>
    );
  }

  // 吸附感知的 clipPath 和 borderRadius：三层裁剪必须一致
  const r = dimensions.borderRadius;
  const snapBorderRadius = snapPosition === "top"
    ? `0px 0px ${r}px ${r}px`
    : snapPosition === "bottom"
      ? `${r}px ${r}px 0px 0px`
      : `${r}px`;
  const snapClipPath = snapPosition === "top"
    ? `inset(0px round 0px 0px ${r}px ${r}px)`
    : snapPosition === "bottom"
      ? `inset(0px round ${r}px ${r}px 0px 0px)`
      : `inset(0px round ${r}px)`;

  const transition: Transition = !isExpanded
    ? { type: "spring", ...SPRING_CONFIG.collapse }
    : !wasExpanded
      ? { type: "spring", ...SPRING_CONFIG.expand }
      : { duration: 0.15, ease: "easeOut" };

  // 动画完成：HWND 端点 no-op 同步（保留契约）+ region 跟随 motion.div 当前矩形
  // region 计算：motion.div 在 bbox 内顶部居中（#root align-items: flex-start + justify-content: center）
  const handleAnimationComplete = () => {
    if (!window.__TAURI_INTERNALS__) return;
    invoke("update_overlay_size", {
      width: bbox.width,
      height: bbox.height,
      webviewScaleFactor: getWebviewScaleFactor(),
      borderRadius: r,
      anchorCenter: true,
      snapPosition: snapPosition ?? null,
    }).catch(reportIpcError);
    invoke("set_overlay_region", {
      x: Math.max(0, (bbox.width - dimensions.width) / 2),
      y: 0,
      w: dimensions.width,
      h: dimensions.height,
      webviewScaleFactor: getWebviewScaleFactor(),
    }).catch(reportIpcError);
    // Bug 1 诊断：记录 motion.div 实际 offset 尺寸 vs 目标，验证视觉与状态一致
    const motionEl = motionDivRef.current;
    logAnimDiag("anim complete", {
      isExpanded,
      targetW: dimensions.width,
      targetH: dimensions.height,
      actualW: motionEl?.offsetWidth ?? null,
      actualH: motionEl?.offsetHeight ?? null,
      bboxW: bbox.width,
      bboxH: bbox.height,
    });
    onComplete?.();
  };

  return (
    <motion.div
      ref={motionDivRef}
      className={className}
      data-testid={testId}
      style={{
        overflow: "hidden",
        clipPath: snapClipPath,
      }}
      initial={false}
      animate={{
        width: dimensions.width,
        height: dimensions.height,
        borderRadius: snapBorderRadius,
        /* Reference: hover scale 1.028 (2.8% overshoot) */
        scale: isExpanded ? [1, 1.028, 1] : [1, 0.972, 1],
      }}
      transition={{
        ...transition,
        scale: { duration: 0.22, ease: "easeOut" },
      }}
      onAnimationComplete={handleAnimationComplete}
    >
      {children}
    </motion.div>
  );
}
