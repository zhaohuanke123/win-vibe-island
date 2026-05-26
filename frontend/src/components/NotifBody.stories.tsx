import type { Story } from "@ladle/react";
import { NotifBody } from "./NotifBody";
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

export const TwoWay: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <NotifBody
      kind="two"
      session={makeSession()}
      standalone
      onSubmit={() => {}}
    />
  </div>
);

export const ThreeWay: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <NotifBody
      kind="three"
      session={makeSession()}
      standalone
      onSubmit={() => {}}
    />
  </div>
);

export const Jump: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <NotifBody
      kind="jump"
      session={makeSession({
        currentTool: {
          name: "AskUserQuestion",
          input: {
            question: "Which library should we use for date formatting?",
            options: [
              { label: "date-fns", description: "Lightweight, tree-shakeable" },
              { label: "dayjs", description: "Moment.js compatible, 2KB" },
              { label: "luxon", description: "Full-featured, timezone support" },
            ],
          },
          startTime: Date.now() - 10000,
          toolUseId: "tool-002",
        },
      })}
      standalone
      onSubmit={() => {}}
      onJump={() => {}}
    />
  </div>
);

export const JumpWithPreview: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <NotifBody
      kind="jump"
      session={makeSession({
        currentTool: {
          name: "AskUserQuestion",
          input: {
            question: "Which approach should we take?",
            options: [
              {
                label: "Option A: Refactor",
                description: "Rewrite the existing module",
                preview: "// Before\nfunction oldWay() {\n  return fetch('/api');\n}\n\n// After\nasync function newWay() {\n  return await api.get();\n}",
              },
              {
                label: "Option B: New module",
                description: "Create a separate module alongside",
              },
            ],
          },
          startTime: Date.now() - 10000,
          toolUseId: "tool-003",
        },
      })}
      standalone
      onSubmit={() => {}}
      onJump={() => {}}
    />
  </div>
);

export const Done: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <NotifBody
      kind="done"
      session={makeSession({
        state: "completed",
        lastError: "Build completed successfully",
        currentTool: undefined,
      })}
      standalone
      onJump={() => {}}
    />
  </div>
);

export const DoneWithError: Story = () => (
  <div style={{ maxWidth: 400 }}>
    <NotifBody
      kind="done"
      session={makeSession({
        state: "completed",
        lastError: "Build failed: Module not found",
        currentTool: undefined,
      })}
      standalone
      onJump={() => {}}
    />
  </div>
);
