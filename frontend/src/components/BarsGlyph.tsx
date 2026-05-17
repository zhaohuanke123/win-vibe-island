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

// Reference geometry: bar width 2.5, positions at 5.25/10.75/16.25, radius 1.25
// Running: stagger 0/0.15s/0.30s, height cycle [4,12,4] → [6,14,6] → [4,10,4]
// Idle: bar default height 3/5/3 (middle breathes via CSS)
// Waiting: outer bars 10pt, middle hidden

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
  const isWaiting = glyphMode === "waiting";

  // Idle default heights: left 3, middle 5, right 3
  const idleH = [3, 5, 3];
  // Waiting: outer bars 10, middle 0 (hidden)
  const waitH = [10, 0, 10];

  const xPositions = [5.25, 10.75, 16.25];
  const barWidth = 2.5;
  const barRadius = 1.25;

  return (
    <svg
      className={`bars-glyph ${glyphMode}`}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      data-testid={testId}
    >
      {xPositions.map((x, i) => {
        const h = isWaiting ? waitH[i] : idleH[i];
        const y = 12 - h / 2;

        // Running: animated with SMIL, reference heights [4,12,4] → [6,14,6] → [4,10,4]
        if (isRunning) {
          const heightSets = [
            ["4;12;4", "6;14;6", "4;10;4"],
          ][0];
          const ySets = [
            ["10;6;10", "8;5;8", "10;7;10"],
          ][0];
          return (
            <rect
              key={i}
              className={`bar bar-${i + 1}`}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={barRadius}
              opacity={i === 1 && isWaiting ? 0 : 1}
            >
              <animate
                attributeName="y"
                values={ySets[i]}
                dur="0.9s"
                begin={`${i * 0.15}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="height"
                values={heightSets[i]}
                dur="0.9s"
                begin={`${i * 0.15}s`}
                repeatCount="indefinite"
              />
            </rect>
          );
        }

        return (
          <rect
            key={i}
            className={`bar bar-${i + 1}`}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={barRadius}
            opacity={i === 1 && isWaiting ? 0 : 1}
          />
        );
      })}
    </svg>
  );
});
