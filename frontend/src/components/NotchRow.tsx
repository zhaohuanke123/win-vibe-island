import { memo, type ReactNode } from "react";
import { BarsGlyph } from "./BarsGlyph";
import type { UIPhase } from "../store/sessions";
import { getAgent, type AgentType } from "../shared/agents";

interface NotchRowProps {
  phase?: UIPhase;
  agent?: AgentType;
  label?: string;
  rightSlot?: ReactNode;
  onClick?: () => void;
  "data-testid"?: string;
}

export const NotchRow = memo(function NotchRow({
  phase,
  agent,
  label,
  rightSlot,
  onClick,
  "data-testid": testId,
}: NotchRowProps) {
  const agentInfo = agent ? getAgent(agent) : null;

  return (
    <div
      className="notch-row"
      onClick={onClick}
      data-testid={testId}
    >
      <span className="notch-row__glyph">
        <BarsGlyph phase={phase ?? "idle"} data-testid="notch-glyph" />
      </span>
      {agentInfo && (
        <span
          className="notch-row__agent-dot"
          style={{ background: agentInfo.color }}
        />
      )}
      {label != null ? (
        <span className="notch-row__label">{label}</span>
      ) : (
        <span className="notch-row__spacer" />
      )}
      {rightSlot && <span className="notch-row__right">{rightSlot}</span>}
    </div>
  );
});
