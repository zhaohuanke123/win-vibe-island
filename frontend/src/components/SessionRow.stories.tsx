import type { Story } from "@ladle/react";
import { SessionRow } from "./SessionRow";
import type { Session } from "../store/sessions";

// ── Mock session factory ─────────────────────────────────────────────────────

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: "session-001",
    label: "my-project",
    title: "my-project (feature/branch)",
    cwd: "/Users/dev/my-project",
    state: "running",
    pid: 12345,
    createdAt: Date.now() - 300000,
    lastActivity: Date.now() - 5000,
    toolHistory: [],
    agent: "claude",
    currentTool: {
      name: "Bash",
      input: { command: "npm run build" },
      startTime: Date.now() - 10000,
      toolUseId: "tool-001",
    },
    ...overrides,
  };
}

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow session={makeSession()} />
  </div>
);

export const Active: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow session={makeSession()} isActive />
  </div>
);

export const Compact: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow session={makeSession()} density="compact" />
  </div>
);

export const WithBarIndicator: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow session={makeSession()} indicatorKind="bar" />
  </div>
);

export const WithGlyphIndicator: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow session={makeSession()} indicatorKind="glyph" />
  </div>
);

export const Completed: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow
      session={makeSession({
        state: "completed",
        currentTool: undefined,
        lastError: "Task completed successfully",
      })}
    />
  </div>
);

export const WaitingApproval: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <SessionRow
      session={makeSession({
        state: "waitingForApproval",
        notifKind: "two",
      })}
    />
  </div>
);

export const DifferentAgents: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
    {(["claude", "codex", "cursor", "gemini"] as const).map((agent) => (
      <SessionRow key={agent} session={makeSession({ agent })} />
    ))}
  </div>
);
