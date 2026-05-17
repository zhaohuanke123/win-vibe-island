import type { UIPhase } from "../store/sessions";
import { phaseColor } from "../shared/phase-colors";
import { BarsGlyph } from "./BarsGlyph";
import "./StateIndicator.css";

export type StateIndicatorKind = "dot" | "bar" | "glyph" | "tint";

export interface StateIndicatorProps {
  kind: StateIndicatorKind;
  phase: UIPhase;
  projectName?: string;
  "data-testid"?: string;
}

/**
 * StateIndicator renders a visual variant for showing session phase.
 *
 * - dot:   colored circle 10px
 * - bar:   3px left-edge strip via ::before pseudo-element
 * - glyph: mini BarsGlyph 16x16 (idle shows static dim dot)
 * - tint:  no indicator element; projectName gets phaseColor inline
 */
export function StateIndicator({
  kind,
  phase,
  projectName,
  "data-testid": testId,
}: StateIndicatorProps) {
  const color = phaseColor(phase);

  if (kind === "tint") {
    if (!projectName) return null;
    return (
      <span
        className="ind-tint"
        style={{ color }}
        data-testid={testId}
      >
        {projectName}
      </span>
    );
  }

  if (kind === "glyph") {
    if (phase === "idle") {
      // idle: static dim dot instead of animated glyph
      return (
        <span
          className="ind-glyph ind-glyph--idle"
          data-testid={testId}
        >
          <span className="ind-glyph__idle-dot" />
        </span>
      );
    }
    return (
      <span className="ind-glyph" data-testid={testId}>
        <BarsGlyph phase={phase} />
      </span>
    );
  }

  if (kind === "bar") {
    return (
      <span
        className="ind-bar"
        style={{ "--phase-color": color } as React.CSSProperties}
        data-testid={testId}
      >
        {projectName && (
          <span className="ind-bar__label">{projectName}</span>
        )}
      </span>
    );
  }

  // default: dot
  return (
    <span
      className="ind-dot"
      style={{ backgroundColor: color }}
      data-testid={testId}
    />
  );
}
