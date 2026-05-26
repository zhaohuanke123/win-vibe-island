import type { Story } from "@ladle/react";
import { ApprovalPanel } from "./ApprovalPanel";
import type { ApprovalRequest } from "../store/sessions";
import { APPROVAL_TYPES } from "../store/sessions";

// ── Mock data helpers ────────────────────────────────────────────────────────

function makePermissionRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    toolUseId: "tool-001",
    sessionId: "session-001",
    sessionLabel: "my-project (feature/branch)",
    approvalType: APPROVAL_TYPES.PERMISSION,
    timestamp: Date.now(),
    toolName: "Bash",
    toolInput: { command: "rm -rf node_modules && npm install" },
    action: "Execute the following command in terminal",
    riskLevel: "medium",
    ...overrides,
  };
}

function makeQuestionRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    toolUseId: "tool-002",
    sessionId: "session-002",
    sessionLabel: "my-project (feature/branch)",
    approvalType: APPROVAL_TYPES.QUESTION,
    timestamp: Date.now(),
    questions: [
      {
        question: "Which library should we use for date formatting?",
        header: "Library",
        options: [
          { label: "date-fns", description: "Lightweight, tree-shakeable" },
          { label: "dayjs", description: "Moment.js compatible API, 2KB" },
          { label: "luxon", description: "Full-featured, timezone support" },
        ],
        multiSelect: false,
      },
    ],
    ...overrides,
  };
}

function makePlanRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    toolUseId: "tool-003",
    sessionId: "session-003",
    sessionLabel: "my-project (feature/branch)",
    approvalType: APPROVAL_TYPES.PLAN,
    timestamp: Date.now(),
    planContent: `## Implementation Plan

### Phase 1: Setup
1. Install dependencies
2. Configure build tools

### Phase 2: Core Logic
1. Implement data fetching
2. Add state management

### Phase 3: UI
1. Build components
2. Add animations`,
    ...overrides,
  };
}

// ── Stories ──────────────────────────────────────────────────────────────────

export const PermissionPanel: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makePermissionRequest()}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const PermissionHighRisk: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makePermissionRequest({
        riskLevel: "high",
        action: "Delete production database",
        toolInput: { command: "DROP DATABASE production;" },
      })}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const PermissionLowRisk: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makePermissionRequest({
        riskLevel: "low",
        action: "Read file contents",
        toolInput: { command: "cat package.json" },
      })}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const PermissionWithDiff: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makePermissionRequest({
        toolName: "Edit",
        action: "Modify src/App.tsx",
        diff: {
          fileName: "src/App.tsx",
          oldContent: 'import React from "react";\n\nfunction App() {\n  return <div>Hello</div>;\n}',
          newContent: 'import React, { useState } from "react";\n\nfunction App() {\n  const [count, setCount] = useState(0);\n  return <div>Hello {count}</div>;\n}',
        },
      })}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const QuestionPanel: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makeQuestionRequest()}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const QuestionWithPreview: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makeQuestionRequest({
        questions: [
          {
            question: "Which approach should we take?",
            header: "Approach",
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
            multiSelect: false,
          },
        ],
      })}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const PlanPanel: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makePlanRequest()}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const PlanEmpty: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={makePlanRequest({ planContent: "" })}
      onApprovalHandled={() => {}}
    />
  </div>
);

export const Empty: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <ApprovalPanel
      request={null}
      onApprovalHandled={() => {}}
    />
  </div>
);
