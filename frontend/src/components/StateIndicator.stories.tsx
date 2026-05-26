import type { Story } from "@ladle/react";
import { StateIndicator } from "./StateIndicator";
import type { StateIndicatorKind } from "./StateIndicator";
import type { UIPhase } from "../store/sessions";

// ── Stories ──────────────────────────────────────────────────────────────────

const phases: UIPhase[] = ["idle", "running", "waitingForApproval", "waitingForAnswer", "completed"];

export const DotVariant: Story = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
    {phases.map((phase) => (
      <StateIndicator key={phase} kind="dot" phase={phase} />
    ))}
  </div>
);

export const BarVariant: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {phases.map((phase) => (
      <div key={phase} style={{ padding: "4px 8px", position: "relative" }}>
        <StateIndicator kind="bar" phase={phase} />
        <span style={{ marginLeft: 12, color: "var(--paper-55)", fontSize: 12 }}>{phase}</span>
      </div>
    ))}
  </div>
);

export const GlyphVariant: Story = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
    {phases.map((phase) => (
      <StateIndicator key={phase} kind="glyph" phase={phase} />
    ))}
  </div>
);

export const TintVariant: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {phases.map((phase) => (
      <StateIndicator key={phase} kind="tint" phase={phase} projectName="my-project" />
    ))}
  </div>
);
