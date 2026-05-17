import { memo } from "react";
import type { UIPhase } from "../store/sessions";
import "./StatusDot.css";

interface StatusDotProps {
  state: UIPhase;
  "data-testid"?: string;
}

export const StatusDot = memo(function StatusDot({ state, "data-testid": testId }: StatusDotProps) {
  let className = "status-dot";
  if (state === "running") className += " status-dot--running";
  else if (state === "waitingForApproval") className += " status-dot--approval";
  else if (state === "waitingForAnswer") className += " status-dot--answer";
  else if (state === "completed") className += " status-dot--done";
  else className += " status-dot--idle";

  return (
    <span
      className={className}
      data-testid={testId}
    />
  );
});
