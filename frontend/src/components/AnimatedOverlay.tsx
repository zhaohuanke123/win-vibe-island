import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, type Transition } from "framer-motion";
import { OVERLAY_DIMENSIONS, SIZE_SYNC_THROTTLE_MS, SPRING_CONFIG } from "../config/animation";

interface AnimatedOverlayProps {
  isExpanded: boolean;
  expandedHeight?: number;
  className?: string;
  children: React.ReactNode;
  "data-testid"?: string;
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

export function AnimatedOverlay({ isExpanded, expandedHeight, className, children, "data-testid": testId }: AnimatedOverlayProps) {
  const lastSyncRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const prevExpandedRef = useRef(false);
  const finalSyncTimerRef = useRef<number | null>(null);

  const expandedDim = {
    ...OVERLAY_DIMENSIONS.expanded,
    height: expandedHeight ?? OVERLAY_DIMENSIONS.expanded.height,
  };
  const dimensions = isExpanded ? expandedDim : OVERLAY_DIMENSIONS.compact;
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
      borderRadius: Math.round(borderRadius),
      anchorCenter: true,
    }).catch((e) => console.error("Failed to sync overlay size:", e));
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
      }}
      initial={false}
      animate={{
        width: dimensions.width,
        height: dimensions.height,
        borderRadius: dimensions.borderRadius,
        clipPath: `inset(0px round ${dimensions.borderRadius}px)`,
        scale: isExpanded ? [1, 1.015, 1] : [1, 0.985, 1],
      }}
      transition={{
        ...transition,
        scale: { duration: 0.22, ease: "easeOut" },
      }}
      onUpdate={(latest: AnimatedSize) => {
        const width = toNumber(latest.width);
        const height = toNumber(latest.height);
        const borderRadius = toNumber(latest.borderRadius) ?? dimensions.borderRadius;
        if (width === null || height === null) return;

        const now = Date.now();
        if (now - lastSyncRef.current < SIZE_SYNC_THROTTLE_MS) return;
        lastSyncRef.current = now;
        syncWindowSize(width, height, borderRadius);
      }}
      onAnimationComplete={() => {
        console.log(`[AnimatedOverlay] onAnimationComplete: ${dimensions.width}x${dimensions.height} expanded=${isExpanded}`);
        syncFinalWindowSize();
      }}
    >
      {children}
    </motion.div>
  );
}
