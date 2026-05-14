import { describe, it, expect } from "vitest";
import { AppError, toAppError } from "../shared/app-error";
import { ErrorRegistry, type ErrorCode } from "../shared/error-dictionary";

/* ============================================================
 * Error Dictionary 测试
 * ============================================================ */
describe("ErrorDictionary", () => {
  it("所有注册的 error code 都有完整结构", () => {
    const codes = Object.keys(ErrorRegistry) as ErrorCode[];
    expect(codes.length).toBeGreaterThan(0);

    for (const code of codes) {
      const entry = ErrorRegistry[code];
      expect(entry.message).toBeTruthy();
      expect(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]).toContain(
        entry.severity,
      );
      expect(entry.aiHint).toBeDefined();
      expect(Array.isArray(entry.aiHint.checkFiles)).toBe(true);
    }
  });

  it("核心 error code 已注册", () => {
    expect(ErrorRegistry.TAURI_IPC_ERROR).toBeDefined();
    expect(ErrorRegistry.COMPONENT_RENDER_ERROR).toBeDefined();
    expect(ErrorRegistry.NOTIFICATION_ERROR).toBeDefined();
  });

  it("aiHint 结构完整", () => {
    const hint = ErrorRegistry.TAURI_IPC_ERROR.aiHint;
    expect(hint.checkFiles.length).toBeGreaterThan(0);
    expect(typeof hint.possibleCause).toBe("string");
    expect(typeof hint.resolutionGuide).toBe("string");
  });
});

/* ============================================================
 * AppError 测试
 * ============================================================ */
describe("AppError", () => {
  it("构造时自动注入 aiHint", () => {
    const err = new AppError("TAURI_IPC_ERROR", { userId: "u1" });
    expect(err.code).toBe("TAURI_IPC_ERROR");
    expect(err.message).toContain("TAURI_IPC_ERROR");
    expect(err.context.userId).toBe("u1");
    // aiHint 自动从 Registry 注入
    expect(err.aiHint).toBe(ErrorRegistry.TAURI_IPC_ERROR.aiHint);
    expect(err.aiHint.checkFiles.length).toBeGreaterThan(0);
  });

  it("未知 error code 不崩溃", () => {
    // 在运行时动态加的 code（模拟 AI 新注册但类型没同步）
    const err = new AppError("UNKNOWN_ERROR" as ErrorCode, {});
    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.aiHint).toBeDefined();
    expect(err.aiHint.checkFiles).toEqual([]);
  });

  it("toJSON 输出结构化对象", () => {
    const err = new AppError("NOTIFICATION_ERROR", {
      action: "playSound",
    });
    const json = err.toJSON();

    expect(json.error_code).toBe("NOTIFICATION_ERROR");
    expect(json.timestamp).toBeTruthy();
    expect(json.context.action).toBe("playSound");
    expect(json.ai_hint).toBeDefined();
    expect(json.stack).toBeTruthy();
    expect(json.cause).toBeUndefined();
  });

  it("支持 chain cause", () => {
    const cause = new Error("network timeout");
    const err = new AppError("TAURI_IPC_ERROR", {}, cause);
    expect(err.cause?.message).toBe("network timeout");
    expect(err.toJSON().cause).toBe("network timeout");
  });
});

/* ============================================================
 * toAppError 兜底测试
 * ============================================================ */
describe("toAppError", () => {
  it("AppError 原样返回", () => {
    const original = new AppError("NOTIFICATION_ERROR");
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it("普通 Error 包装为 AppError", () => {
    const result = toAppError(new Error("crash"), "COMPONENT_RENDER_ERROR");
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe("COMPONENT_RENDER_ERROR");
    expect(result.cause?.message).toBe("crash");
  });

  it("字符串用默认 code 兜底", () => {
    const result = toAppError("something broke");
    expect(result.code).toBe("UNKNOWN_ERROR");
  });

  it("null/undefined 不崩溃", () => {
    const result = toAppError(null, "UNKNOWN_ERROR");
    expect(result.code).toBe("UNKNOWN_ERROR");
  });
});
