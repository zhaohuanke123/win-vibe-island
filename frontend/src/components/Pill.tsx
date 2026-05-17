import { useEffect, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, type Transition } from "framer-motion";
import { SPRING_CONFIG } from "../config/animation";
import { NotchRow } from "./NotchRow";
import type { UIPhase } from "../store/sessions";
import type { AgentType } from "../shared/agents";
import type { ReactNode } from "react";
import "./Pill.css";

export type PillMode = "notch" | "panel" | "notif";

const MODE_DIMENSIONS: Record<PillMode, { width: number; height: number }> = {
  notch: { width: 180, height: 32 },
  panel: { width: 380, height: 380 },
  notif: { width: 320, height: 120 },
};

const PILL_BORDER_RADIUS = 20;

interface PillProps {
  mode: PillMode;
  phase?: UIPhase;
  agent?: AgentType;
  label?: string;
  notchRightSlot?: ReactNode;
  children?: ReactNode;
  onNotchClick?: () => void;
  "data-testid"?: string;
}

export const Pill = memo(function Pill({
  mode,
  phase,
  agent,
  label,
  notchRightSlot,
  children,
  onNotchClick,
  "data-testid": testId,
}: PillProps) {
  const lastSyncRef = useRef(0);
  const hasInitRef = useRef(false);

  const dims = MODE_DIMENSIONS[mode];

  const syncWindowSize = (width: number, height: number) => {
    if (!window.__TAURI_INTERNALS__) return;
    invoke("update_overlay_size", {
      width: Math.round(width),
      height: Math.round(height),
      webviewScaleFactor: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1,
      borderRadius: PILL_BORDER_RADIUS,
      anchorCenter: true,
    }).catch(() => {});
  };

  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;
    syncWindowSize(dims.width, dims.height);
  }, [dims.width, dims.height]);

  const transition: Transition = { type: "spring", ...SPRING_CONFIG.expand };

  return (
    <motion.div
      className={`pill pill--${mode}`}
      data-testid={testId}
      initial={false}
      animate={{
        width: dims.width,
        height: dims.height,
      }}
      transition={transition}
      onUpdate={(latest) => {
        const w = typeof latest.width === "number" ? latest.width : dims.width;
        const h = typeof latest.height === "number" ? latest.height : dims.height;
        const now = Date.now();
        if (now - lastSyncRef.current < 16) return;
        lastSyncRef.current = now;
        syncWindowSize(w, h);
      }}
      onAnimationComplete={() => {
        syncWindowSize(dims.width, dims.height);
      }}
    >
      {mode === "notch" ? (
        <NotchRow
          phase={phase}
          agent={agent}
          label={label}
          rightSlot={notchRightSlot}
          onClick={onNotchClick}
        />
      ) : (
        <>
          <NotchRow
            phase={phase}
            agent={agent}
            label={label}
            rightSlot={notchRightSlot}
            onClick={onNotchClick}
          />
          <div className="pill__body">
            {children}
          </div>
        </>
      )}
    </motion.div>
  );
});
