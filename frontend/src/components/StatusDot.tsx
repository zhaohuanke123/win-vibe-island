import { motion, type Transition } from "framer-motion";
import { useConfigStore } from "../store/config";
import "./StatusDot.css";

export type AgentState = "idle" | "thinking" | "running" | "streaming" | "approval" | "error" | "done";

interface StatusDotProps {
  state: AgentState;
}

export function StatusDot({ state }: StatusDotProps) {
  const getStateColor = useConfigStore((s) => s.getStateColor);
  const getAnimationDuration = useConfigStore((s) => s.getAnimationDuration);
  const getSpringConfig = useConfigStore((s) => s.getSpringConfig);

  const color = getStateColor(state);
  const transitionSpring = getSpringConfig("transition");

  const isThinking = state === "thinking";
  const isRunning = state === "running";
  const isStreaming = state === "streaming";
  const isApproval = state === "approval";

  const getAnimation = () => {
    if (isThinking) {
      return {
        backgroundColor: color,
        scale: [1, 1.3, 1],
        opacity: 1,
      };
    }
    if (isRunning) {
      return {
        backgroundColor: color,
        scale: 1,
        opacity: [1, 0.5, 1],
      };
    }
    if (isStreaming) {
      return {
        backgroundColor: color,
        scale: 1,
        opacity: [1, 0.3, 1],
      };
    }
    if (isApproval) {
      return {
        backgroundColor: color,
        scale: [1, 1.2, 1],
        opacity: 1,
      };
    }
    return {
      backgroundColor: color,
      scale: 1,
      opacity: 1,
    };
  };

  const getTransition = (): Transition => {
    const springBase = { type: "spring" as const, stiffness: transitionSpring.stiffness, damping: transitionSpring.damping };

    if (isThinking) {
      return {
        backgroundColor: springBase,
        scale: { duration: getAnimationDuration("thinking") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isRunning) {
      return {
        backgroundColor: springBase,
        opacity: { duration: getAnimationDuration("running") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isStreaming) {
      return {
        backgroundColor: springBase,
        opacity: { duration: getAnimationDuration("streaming") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isApproval) {
      return {
        backgroundColor: springBase,
        scale: { duration: getAnimationDuration("approval") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    return {
      backgroundColor: springBase,
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
