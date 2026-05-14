import { ErrorRegistry, type ErrorCode } from "./error-dictionary";

/** 结构化业务上下文，追加到每条错误 */
export interface ErrorContext {
  userId?: string;
  action?: string;
  uiState?: "LOADING" | "EMPTY" | "ERROR" | "NORMAL";
  [key: string]: unknown;
}

/**
 * AI-Native 结构化异常。
 * 构造时自动从 ErrorRegistry 查找 error code 定义并注入 aiHint。
 */
export class AppError extends Error {
  /** 错误码（命名空间: MODULE_SUB_SPECIFIC） */
  readonly code: ErrorCode;
  /** 业务上下文 */
  readonly context: ErrorContext;
  /** 原始 Error （链式 cause） */
  readonly cause?: Error;

  constructor(code: ErrorCode, context?: ErrorContext, cause?: Error) {
    const entry = ErrorRegistry[code];
    const message = entry?.message ?? code;
    super(`[${code}] ${message}`);
    this.name = "AppError";
    this.code = code;
    this.context = context ?? {};
    this.cause = cause;
  }

  /** 注册表中的 AI 修复线索（如有） */
  get aiHint() {
    return ErrorRegistry[this.code]?.aiHint;
  }

  /** 序列化为 JSON（方便日志输出） */
  toJSON() {
    return {
      timestamp: new Date().toISOString(),
      error_code: this.code,
      message: this.message,
      context: this.context,
      ai_hint: this.aiHint,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/** 将任意 caught 值统一转为 AppError（兜底用） */
export function toAppError(
  err: unknown,
  fallbackCode: ErrorCode = "UNKNOWN_ERROR",
  context?: ErrorContext,
): AppError {
  if (err instanceof AppError) return err;
  const cause = err instanceof Error ? err : undefined;
  return new AppError(fallbackCode, context, cause);
}
