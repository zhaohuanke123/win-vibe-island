import { motion, type Transition } from "framer-motion";
import "./StatusDot.css";

export type AgentState = "idle" | "thinking" | "running" | "streaming" | "approval" | "error" | "done";

interface StatusDotProps {
  state: AgentState;
}

const STATE_COLORS: Record<AgentState, string> = {
  idle: "#6b7280",      // gray
  thinking: "#a78bfa",  // purple - pulsing scale
  running: "#3b82f6",   // blue - pulsing opacity
  streaming: "#06b6d4", // cyan - fast pulse
  approval: "#f59e0b",  // amber - fast pulse
  error: "#ef4444",     // red - solid
  done: "#22c55e",      // green - solid
};

export function StatusDot({ state }: StatusDotProps) {
  const isThinking = state === "thinking";
  const isRunning = state === "running";
  const isStreaming = state === "streaming";
  const isApproval = state === "approval";

  // Determine animation based on state
  const getAnimation = () => {
    if (isThinking) {
      // Thinking: scale pulse (1 → 1.3 → 1)
      return {
        backgroundColor: STATE_COLORS[state],
        scale: [1, 1.3, 1],
        opacity: 1,
      };
    }
    if (isRunning) {
      // Running: opacity pulse (1 → 0.5 → 1)
      return {
        backgroundColor: STATE_COLORS[state],
        scale: 1,
        opacity: [1, 0.5, 1],
      };
    }
    if (isStreaming) {
      // Streaming: fast opacity pulse
      return {
        backgroundColor: STATE_COLORS[state],
        scale: 1,
        opacity: [1, 0.3, 1],
      };
    }
    if (isApproval) {
      // Approval: fast scale pulse
      return {
        backgroundColor: STATE_COLORS[state],
        scale: [1, 1.2, 1],
        opacity: 1,
      };
    }
    // Default: solid color
    return {
      backgroundColor: STATE_COLORS[state],
      scale: 1,
      opacity: 1,
    };
  };

  const getTransition = (): Transition => {
    if (isThinking) {
      return {
        backgroundColor: { type: "spring", stiffness: 400, damping: 30 },
        scale: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isRunning) {
      return {
        backgroundColor: { type: "spring", stiffness: 400, damping: 30 },
        opacity: { duration: 1.0, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isStreaming) {
      return {
        backgroundColor: { type: "spring", stiffness: 400, damping: 30 },
        opacity: { duration: 0.5, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isApproval) {
      return {
        backgroundColor: { type: "spring", stiffness: 400, damping: 30 },
        scale: { duration: 0.6, repeat: Infinity, ease: "easeInOut" },
      };
    }
    return {
      backgroundColor: { type: "spring", stiffness: 400, damping: 30 },
    };
  };

  return (
    <motion.span
      className={`status-dot status-dot--${state}`}
      animate={getAnimation()}
      transition={getTransition()}
    />
  );
}
