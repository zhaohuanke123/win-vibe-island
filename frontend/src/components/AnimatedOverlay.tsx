import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, type Transition } from "framer-motion";
import { OVERLAY_DIMENSIONS, SIZE_SYNC_THROTTLE_MS, SPRING_CONFIG } from "../config/animation";
import { Pill, type PillMode } from "./Pill";
import { logger } from "../client/logger";
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
}

type AnimatedSize = {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
};

function toNumber(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getWebviewScaleFactor() {
  return Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
}

function reportResizeError(error: unknown) {
  logger.warn("TAURI_IPC_ERROR", "failed to sync overlay size", { error: String(error) });
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
}: AnimatedOverlayProps) {
  // Pill mode: delegate rendering to Pill component
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

  const lastSyncRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const prevExpandedRef = useRef(false);
  const finalSyncTimerRef = useRef<number | null>(null);

  const expandedDim = {
    ...OVERLAY_DIMENSIONS.expanded,
    height: expandedHeight ?? OVERLAY_DIMENSIONS.expanded.height,
  };
  const dimensions = isExpanded ? expandedDim : OVERLAY_DIMENSIONS.compact;

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

  const latestDimensionsRef = useRef(dimensions);

  const wasExpanded = prevExpandedRef.current;
  const transition: Transition = !isExpanded
    ? { type: "spring", ...SPRING_CONFIG.collapse }
    : !wasExpanded
      ? { type: "spring", ...SPRING_CONFIG.expand }
      : { duration: 0.15, ease: "easeOut" };

  useEffect(() => { prevExpandedRef.current = isExpanded; }, [isExpanded]);

  useEffect(() => {
    latestDimensionsRef.current = dimensions;
  }, [dimensions.width, dimensions.height, dimensions.borderRadius]);

  const syncWindowSize = (width: number, height: number, borderRadius: number) => {
    if (!window.__TAURI_INTERNALS__) return;

    invoke("update_overlay_size", {
      width: Math.round(width),
      height: Math.round(height),
      webviewScaleFactor: getWebviewScaleFactor(),
      borderRadius: Math.round(borderRadius),
      anchorCenter: true,
      snapPosition: snapPosition ?? null,
    }).catch(reportResizeError);
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    syncWindowSize(
      OVERLAY_DIMENSIONS.compact.width,
      OVERLAY_DIMENSIONS.compact.height,
      OVERLAY_DIMENSIONS.compact.borderRadius,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (finalSyncTimerRef.current !== null) {
        window.clearTimeout(finalSyncTimerRef.current);
      }
    };
  }, []);

  const syncFinalWindowSize = () => {
    const finalDimensions = latestDimensionsRef.current;
    syncWindowSize(finalDimensions.width, finalDimensions.height, finalDimensions.borderRadius);

    if (finalSyncTimerRef.current !== null) {
      window.clearTimeout(finalSyncTimerRef.current);
    }

    finalSyncTimerRef.current = window.setTimeout(() => {
      const latestDimensions = latestDimensionsRef.current;
      syncWindowSize(latestDimensions.width, latestDimensions.height, latestDimensions.borderRadius);
      finalSyncTimerRef.current = null;
    }, SIZE_SYNC_THROTTLE_MS + 8);
  };

  return (
    <motion.div
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
      onUpdate={(latest: AnimatedSize) => {
        const width = toNumber(latest.width);
        const height = toNumber(latest.height);
        if (width === null || height === null) return;

        const now = Date.now();
        if (now - lastSyncRef.current < SIZE_SYNC_THROTTLE_MS) return;
        lastSyncRef.current = now;
        syncWindowSize(width, height, r);
      }}
      onAnimationComplete={() => {
        syncFinalWindowSize();
      }}
    >
      {children}
    </motion.div>
  );
}
