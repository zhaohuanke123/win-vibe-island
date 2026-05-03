import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, type Transition } from "framer-motion";
import { OVERLAY_DIMENSIONS, SIZE_SYNC_THROTTLE_MS, SPRING_CONFIG } from "../config/animation";

interface AnimatedOverlayProps {
  isExpanded: boolean;
  expandedHeight?: number;
  className?: string;
  children: React.ReactNode;
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

function clampExpandedHeight(height: number | undefined): number {
  const minHeight = OVERLAY_DIMENSIONS.expanded.minHeight;
  const maxHeight = OVERLAY_DIMENSIONS.expanded.maxHeight;
  if (typeof height !== "number" || !Number.isFinite(height)) return minHeight;
  return Math.min(maxHeight, Math.max(minHeight, height));
}

export function AnimatedOverlay({ isExpanded, expandedHeight, className, children }: AnimatedOverlayProps) {
  const lastSyncRef = useRef(0);
  const hasInitializedRef = useRef(false);
  const dimensions = isExpanded
    ? {
        width: OVERLAY_DIMENSIONS.expanded.width,
        height: clampExpandedHeight(expandedHeight),
        borderRadius: OVERLAY_DIMENSIONS.expanded.borderRadius,
      }
    : OVERLAY_DIMENSIONS.compact;
  const transition: Transition = {
    type: "spring",
    ...(isExpanded ? SPRING_CONFIG.expand : SPRING_CONFIG.collapse),
  };

  const syncWindowSize = (width: number, height: number, borderRadius: number) => {
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

  return (
    <motion.div
      className={className}
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
        syncWindowSize(dimensions.width, dimensions.height, dimensions.borderRadius);
      }}
    >
      {children}
    </motion.div>
  );
}
