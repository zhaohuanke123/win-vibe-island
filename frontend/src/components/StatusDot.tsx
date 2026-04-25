import "./StatusDot.css";

export type AgentState = "idle" | "running" | "approval" | "done";

interface StatusDotProps {
  state: AgentState;
}

export function StatusDot({ state }: StatusDotProps) {
  return <span className={`status-dot status-dot--${state}`} />;
}
