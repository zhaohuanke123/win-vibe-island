import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateTransition,
  TRANSITION_MATRIX,
} from "../shared/state-machine";
import type { AgentState } from "../store/sessions";

/* ============================================================
 * State Machine 测试
 * ============================================================ */

const ALL_STATES: AgentState[] = [
  "idle",
  "running",
  "thinking",
  "streaming",
  "approval",
  "error",
  "done",
];

describe("StateMachine: canTransition", () => {
  it("同状态转换总是合法", () => {
    for (const state of ALL_STATES) {
      expect(canTransition(state, state)).toBe(true);
    }
  });

  it("idle → running 合法", () => {
    expect(canTransition("idle", "running")).toBe(true);
    expect(canTransition("idle", "thinking")).toBe(true);
    expect(canTransition("idle", "approval")).toBe(true);
    expect(canTransition("idle", "error")).toBe(true);
  });

  it("running → thinking 合法", () => {
    expect(canTransition("running", "thinking")).toBe(true);
    expect(canTransition("running", "approval")).toBe(true);
    expect(canTransition("running", "error")).toBe(true);
    expect(canTransition("running", "done")).toBe(true);
  });

  it("thinking → streaming 合法", () => {
    expect(canTransition("thinking", "streaming")).toBe(true);
    expect(canTransition("thinking", "error")).toBe(true);
    expect(canTransition("thinking", "approval")).toBe(true);
    expect(canTransition("thinking", "done")).toBe(true);
  });

  it("streaming → thinking 合法（工具循环）", () => {
    expect(canTransition("streaming", "thinking")).toBe(true);
    expect(canTransition("streaming", "done")).toBe(true);
    expect(canTransition("streaming", "error")).toBe(true);
  });

  it("approval → running 合法", () => {
    expect(canTransition("approval", "running")).toBe(true);
    expect(canTransition("approval", "error")).toBe(true);
    expect(canTransition("approval", "done")).toBe(true);
  });

  it("done → idle 合法（新会话）", () => {
    expect(canTransition("done", "idle")).toBe(true);
    expect(canTransition("done", "running")).toBe(true);
  });
});

describe("StateMachine: validateTransition", () => {
  it("合法转换返回 valid=true", () => {
    const result = validateTransition("idle", "running");
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("不合法转换返回 valid=false + reason", () => {
    const result = validateTransition("done", "thinking");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not in the allowed matrix");
  });

  it("不存在的源状态返回 valid=false", () => {
    const result = validateTransition("nonexistent" as AgentState, "idle");
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

  it("所有目标状态都是合法的 AgentState", () => {
    for (const [_from, toList] of Object.entries(TRANSITION_MATRIX)) {
      for (const to of toList) {
        expect(ALL_STATES).toContain(to as AgentState);
      }
    }
  });

  it("done 是最接近终点的状态（最少出边）", () => {
    // done 应该是最受限的状态
    expect(TRANSITION_MATRIX.done.length).toBeLessThanOrEqual(
      Math.min(...ALL_STATES.filter((s) => s !== "done").map((s) => TRANSITION_MATRIX[s].length))
    );
  });
});
