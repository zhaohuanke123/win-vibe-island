import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateTransition,
  TRANSITION_MATRIX,
} from "../shared/state-machine";
import type { UIPhase } from "../store/sessions";

/* ============================================================
 * State Machine 测试 (4-phase model)
 * ============================================================ */

const ALL_STATES: UIPhase[] = [
  "idle",
  "running",
  "waitingForApproval",
  "waitingForAnswer",
  "completed",
];

describe("StateMachine: canTransition", () => {
  it("同状态转换总是合法", () => {
    for (const state of ALL_STATES) {
      expect(canTransition(state, state)).toBe(true);
    }
  });

  it("idle → running 合法", () => {
    expect(canTransition("idle", "running")).toBe(true);
    expect(canTransition("idle", "waitingForApproval")).toBe(true);
    expect(canTransition("idle", "completed")).toBe(true);
  });

  it("running → waiting* 合法", () => {
    expect(canTransition("running", "waitingForApproval")).toBe(true);
    expect(canTransition("running", "waitingForAnswer")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
  });

  it("waitingForApproval → running 合法", () => {
    expect(canTransition("waitingForApproval", "running")).toBe(true);
    expect(canTransition("waitingForApproval", "completed")).toBe(true);
  });

  it("waitingForAnswer → running 合法", () => {
    expect(canTransition("waitingForAnswer", "running")).toBe(true);
    expect(canTransition("waitingForAnswer", "completed")).toBe(true);
  });

  it("completed → idle/running 合法", () => {
    expect(canTransition("completed", "idle")).toBe(true);
    expect(canTransition("completed", "running")).toBe(true);
  });
});

describe("StateMachine: validateTransition", () => {
  it("合法转换返回 valid=true", () => {
    const result = validateTransition("idle", "running");
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("不合法转换返回 valid=false + reason", () => {
    const result = validateTransition("completed", "waitingForApproval");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not in the allowed matrix");
  });

  it("不存在的源状态返回 valid=false", () => {
    const result = validateTransition("nonexistent" as UIPhase, "idle");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unknown state");
  });
});

describe("StateMachine: 转换矩阵完整性", () => {
  it("所有状态都在 TRANSITION_MATRIX 中有定义", () => {
    for (const state of ALL_STATES) {
      expect(TRANSITION_MATRIX[state]).toBeDefined();
      expect(Array.isArray(TRANSITION_MATRIX[state])).toBe(true);
    }
  });

  it("每个状态至少有一条出边", () => {
    for (const state of ALL_STATES) {
      expect(TRANSITION_MATRIX[state].length).toBeGreaterThan(0);
    }
  });

  it("所有目标状态都是合法的 UIPhase", () => {
    for (const [_from, toList] of Object.entries(TRANSITION_MATRIX)) {
      for (const to of toList) {
        expect(ALL_STATES).toContain(to as UIPhase);
      }
    }
  });

  it("completed 是最接近终点的状态（最少出边）", () => {
    expect(TRANSITION_MATRIX.completed.length).toBeLessThanOrEqual(
      Math.min(...ALL_STATES.filter((s) => s !== "completed").map((s) => TRANSITION_MATRIX[s].length))
    );
  });
});
