import { motion } from "framer-motion";
import { SPRING_CONFIG } from "../config/animation";
import "./StatusDot.css";

export type AgentState = "idle" | "thinking" | "running" | "streaming" | "approval" | "error" | "done";

interface StatusDotProps {
  state: AgentState;
}

const STATE_COLORS: Record<AgentState, string> = {
  idle: "#6b7280",
  thinking: "#a78bfa",
  running: "#3b82f6",
  streaming: "#06b6d4",
  approval: "#f59e0b",
  error: "#ef4444",
  done: "#22c55e",
};

export function StatusDot({ state }: StatusDotProps) {
  const isThinking = state === "thinking";

  return (
    <motion.span
      className={`status-dot status-dot--${state}`}
      animate={{
        backgroundColor: STATE_COLORS[state],
        scale: isThinking ? [1, 1.3, 1] : 1,
      }}
      transition={{
        backgroundColor: { type: "spring", ...SPRING_CONFIG.transition },
        scale: {
          duration: 1.2,
          repeat: isThinking ? Infinity : 0,
          ease: "easeInOut",
        },
      }}
    />
  );
}
