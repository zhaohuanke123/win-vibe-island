import { memo } from "react";
import type { UIPhase } from "../store/sessions";
import "./BarsGlyph.css";

export type GlyphMode = "idle" | "running" | "waiting" | "done";

export function phaseGlyph(phase: UIPhase): GlyphMode {
  switch (phase) {
    case "running":
      return "running";
    case "waitingForApproval":
    case "waitingForAnswer":
      return "waiting";
    case "completed":
      return "done";
    default:
      return "idle";
  }
}

interface BarsGlyphProps {
  mode?: GlyphMode;
  phase?: UIPhase;
  "data-testid"?: string;
}

export const BarsGlyph = memo(function BarsGlyph({
  mode,
  phase,
  "data-testid": testId,
}: BarsGlyphProps) {
  const glyphMode = mode ?? (phase != null ? phaseGlyph(phase) : "idle");

  if (glyphMode === "done") {
    return (
      <svg
        className="bars-glyph done"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        data-testid={testId}
      >
        <path
          className="tick-path"
          d="M5 12 l4 4 l10 -10"
          fill="none"
          stroke="#f1ead9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="20"
          strokeDashoffset="20"
        />
      </svg>
    );
  }

  const isRunning = glyphMode === "running";

  return (
    <svg
      className={`bars-glyph ${glyphMode}`}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      data-testid={testId}
    >
      <rect className="bar bar-1" x="4" y="8" width="4" height="8" rx="1">
        {isRunning && (
          <>
            <animate attributeName="y" values="6;14;6" dur="0.9s" begin="0s" repeatCount="indefinite" />
            <animate attributeName="height" values="12;4;12" dur="0.9s" begin="0s" repeatCount="indefinite" />
          </>
        )}
      </rect>
      <rect className="bar bar-2" x="10" y="8" width="4" height="8" rx="1">
        {isRunning && (
          <>
            <animate attributeName="y" values="6;14;6" dur="0.9s" begin="0.2s" repeatCount="indefinite" />
            <animate attributeName="height" values="12;4;12" dur="0.9s" begin="0.2s" repeatCount="indefinite" />
          </>
        )}
      </rect>
      <rect className="bar bar-3" x="16" y="8" width="4" height="8" rx="1">
        {isRunning && (
          <>
            <animate attributeName="y" values="6;14;6" dur="0.9s" begin="0.4s" repeatCount="indefinite" />
            <animate attributeName="height" values="12;4;12" dur="0.9s" begin="0.4s" repeatCount="indefinite" />
          </>
        )}
      </rect>
    </svg>
  );
});
