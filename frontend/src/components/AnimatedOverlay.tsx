import { useEffect } from "react";
import { useMotionValue, animate } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { SPRING_CONFIG, SIZE_SYNC_THROTTLE_MS } from "../config/animation";

interface AnimatedOverlayProps {
  isExpanded: boolean;
  children: React.ReactNode;
}

const COLLAPSED_HEIGHT = 60;
const EXPANDED_HEIGHT = 500;
const OVERLAY_WIDTH = 420;

export function AnimatedOverlay({ isExpanded, children }: AnimatedOverlayProps) {
  const height = useMotionValue(isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT);

  useEffect(() => {
    const target = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    const controls = animate(height, target, {
      type: "spring",
      ...(isExpanded ? SPRING_CONFIG.expand : SPRING_CONFIG.collapse),
      onUpdate(latest) {
        const now = Date.now();
        if (now - (controls as unknown as { _lastSync: number })._lastSync < SIZE_SYNC_THROTTLE_MS) return;
        (controls as unknown as { _lastSync: number })._lastSync = now;
        invoke("update_overlay_size", {
          width: OVERLAY_WIDTH,
          height: Math.round(latest),
        }).catch((e) => console.error("Failed to sync overlay size:", e));
      },
    });
    (controls as unknown as { _lastSync: number })._lastSync = 0;
    return () => controls.stop();
  }, [isExpanded, height]);

  return <>{children}</>;
}
