/**
 * Agent State Machine — 轻量级状态转换矩阵
 *
 * 设计意图：
 *   文档 docs/states-and-flows.md 中的状态转换图被编码为
 *   此处转换矩阵，所有 updateSessionState 调用都会经过校验。
 *
 * 行为：
 *   - 允许的转换：静默执行
 *   - 不允许的转换：记录 WARN 日志 + 仍然执行（不阻塞 UI）
 *   - 目的是给 AI 和开发者提供早期告警，而不是强制约束
 *
 * 维护规则：
 *   AI/开发者添加新状态或事件时，必须在此注册所有合法入边/出边。
 */

import { logger } from "../client/logger";
import type { AgentState } from "../store/sessions";

/**
 * 状态转换矩阵 — 单一事实来源
 *
 * Key:   当前状态 current
 * Value: 所有合法的下一个状态 next
 *
 * 设计参考 docs/states-and-flows.md 中的状态转换图:
 *
 *   idle → running → thinking → streaming → done
 *                     ↓            ↓
 *                  error ←─── PostToolUseFailure
 *   any → approval → running
 */
export const TRANSITION_MATRIX: Record<AgentState, AgentState[]> = {
  idle: ["running", "thinking", "approval", "error", "done"],
  running: ["thinking", "approval", "error", "done", "streaming", "idle"],
  thinking: ["streaming", "error", "approval", "done", "running", "idle"],
  streaming: ["thinking", "done", "error", "approval", "running", "idle"],
  approval: ["running", "error", "done", "idle"],
  error: ["idle", "running", "done", "thinking", "approval"],
  done: ["idle", "running", "error"],
};

/** 检查 current → next 是否合法 */
export function canTransition(
  current: AgentState,
  next: AgentState,
): boolean {
  if (current === next) return true; // 同状态不报错
  const allowed = TRANSITION_MATRIX[current];
  return allowed?.includes(next) ?? false;
}

/**
 * 校验状态转换。
 *
 * @returns { valid: boolean; reason?: string }
 *   - valid: 是否合法
 *   - reason: 不合法时的说明
 */
export function validateTransition(
  current: AgentState,
  next: AgentState,
): { valid: boolean; reason?: string } {
  if (current === next) {
    return { valid: true };
  }

  const allowed = TRANSITION_MATRIX[current];

  if (!allowed) {
    return {
      valid: false,
      reason: `Unknown state "${current}" — no transition rules defined`,
    };
  }

  if (allowed.includes(next)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Transition "${current}" → "${next}" is not in the allowed matrix. ` +
      `Allowed from "${current}": [${allowed.join(", ")}]. ` +
      `If this is intentional, add it to TRANSITION_MATRIX in shared/state-machine.ts.`,
  };
}

/**
 * 安全的转换函数 — 校验 + 日志 + 执行。
 *
 * 返回值与 validateTransition 一致，调用方可根据 valid 决定是否封禁。
 */
export function safeTransition(
  sessionId: string,
  current: AgentState,
  next: AgentState,
  context?: Record<string, unknown>,
): ReturnType<typeof validateTransition> {
  const result = validateTransition(current, next);

  if (!result.valid) {
    logger.warn("STORE_OPERATION_ERROR", `Invalid state transition: ${current} → ${next}`, {
      sessionId,
      currentState: current,
      targetState: next,
      reason: result.reason,
      ...context,
    });
  }

  return result;
}
