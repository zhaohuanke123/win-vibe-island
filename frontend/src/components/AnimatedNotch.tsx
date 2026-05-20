import { motion } from "framer-motion";
import { memo, type ReactNode } from "react";
import { SPRING_CONFIG } from "../config/animation";
import type { UIPhase } from "../store/sessions";
import type { AgentType } from "../shared/agents";
import { BarsGlyph } from "./BarsGlyph";
import { AgentIcon } from "./AgentIcon";

/**
 * AnimatedNotch — the compact pill bar with Framer Motion micro-interactions.
 *
 * Layout morphing is achieved via a shared `layoutId` prop on the wrapper.
 * When the parent Pill transitions notch↔panel, the notch row can morph
 * using Framer Motion's layout animation.
 *
 * Micro-interactions:
 * - Hover: subtle scale (1.02)
 * - Press: slight bounce (scale 0.97 → 1.0)
 * - BarsGlyph animated via phase
 */

interface AnimatedNotchProps {
  phase?: UIPhase;
  agent?: AgentType;
  label?: string;
  rightSlot?: ReactNode;
  onClick?: () => void;
  layoutId?: string;
  "data-testid"?: string;
}

export const AnimatedNotch = memo(function AnimatedNotch({
  phase,
  agent,
  label,
  rightSlot,
  onClick,
  layoutId,
  "data-testid": testId,
}: AnimatedNotchProps) {
  return (
    <motion.div
      className="notch-row"
      data-testid={testId}
      layoutId={layoutId}
      onClick={onClick}
      // Micro-interactions: hover scale, press bounce
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{
        type: "spring",
        ...SPRING_CONFIG.micro,
      }}
    >
      <motion.span
        className="notch-row__glyph"
        layoutId={layoutId ? `${layoutId}-glyph` : undefined}
      >
        <BarsGlyph phase={phase ?? "idle"} data-testid="notch-glyph" />
      </motion.span>

      {agent && (
        <motion.span
          className="notch-row__agent-icon"
          layoutId={layoutId ? `${layoutId}-agent` : undefined}
        >
          <AgentIcon agent={agent} size={14} />
        </motion.span>
      )}

      {label != null ? (
        <motion.span
          className="notch-row__label"
          layoutId={layoutId ? `${layoutId}-label` : undefined}
        >
          {label}
        </motion.span>
      ) : (
        <span className="notch-row__spacer" />
      )}

      {rightSlot && (
        <motion.span
          className="notch-row__right"
          layoutId={layoutId ? `${layoutId}-right` : undefined}
        >
          {rightSlot}
        </motion.span>
      )}
    </motion.div>
  );
});
