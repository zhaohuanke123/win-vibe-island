import { memo } from "react";
import { motion, type Transition } from "framer-motion";
import { useConfigStore } from "../store/config";
import type { UIPhase } from "../store/sessions";
import "./StatusDot.css";

interface StatusDotProps {
  state: UIPhase;
  "data-testid"?: string;
}

export const StatusDot = memo(function StatusDot({ state, "data-testid": testId }: StatusDotProps) {
  const getStateColor = useConfigStore((s) => s.getStateColor);
  const getAnimationDuration = useConfigStore((s) => s.getAnimationDuration);
  const getSpringConfig = useConfigStore((s) => s.getSpringConfig);

  const color = getStateColor(state);
  const transitionSpring = getSpringConfig("transition");

  const isRunning = state === "running";
  const isWaitingForApproval = state === "waitingForApproval";
  const isWaitingForAnswer = state === "waitingForAnswer";
  const isWaiting = isWaitingForApproval || isWaitingForAnswer;

  const getAnimation = () => {
    if (isRunning) {
      return {
        backgroundColor: color,
        scale: 1,
        opacity: [1, 0.5, 1],
      };
    }
    if (isWaiting) {
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

    if (isRunning) {
      return {
        backgroundColor: springBase,
        opacity: { duration: getAnimationDuration("running") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isWaitingForApproval) {
      return {
        backgroundColor: springBase,
        scale: { duration: getAnimationDuration("waitingForApproval") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    if (isWaitingForAnswer) {
      return {
        backgroundColor: springBase,
        scale: { duration: getAnimationDuration("waitingForAnswer") / 1000, repeat: Infinity, ease: "easeInOut" },
      };
    }
    return {
      backgroundColor: springBase,
    };
  };

  return (
    <motion.span
      className={`status-dot status-dot--${state}`}
      data-testid={testId}
      animate={getAnimation()}
      transition={getTransition()}
    />
  );
});
