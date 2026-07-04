import type { UIPhase } from "../store/sessions";

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
