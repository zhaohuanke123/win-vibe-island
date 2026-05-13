import { AppError, type ErrorContext } from "../shared/app-error";
import { type ErrorCode } from "../shared/error-dictionary";

/** JSON 日志条目结构 */
export interface LogEntry {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  message: string;
  error_code?: ErrorCode;
  error?: Record<string, unknown>;
  context?: ErrorContext;
  trace_id?: string;
}

type LogSink = (entry: LogEntry) => void;

/** 浏览器端结构化日志器（替代 Node.js pino） */
class ClientLogger {
  private sinks: LogSink[] = [];
  private traceId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  constructor() {
    // 默认 sink：开发环境输出格式化日志到 console
    this.addSink((entry) => {
      if (import.meta.env.DEV) {
        const prefix = `[${entry.level}] ${entry.error_code ?? ""}`;
        if (entry.level === "ERROR" || entry.level === "FATAL") {
          console.error(prefix, entry.message, {
            context: entry.context,
            error: entry.error,
            trace_id: entry.trace_id,
          });
        } else if (entry.level === "WARN") {
          console.warn(prefix, entry.message, entry.context ?? "");
        } else {
          console.log(prefix, entry.message);
        }
      } else {
        // 生产环境：输出紧凑 JSON（仅 console，见下方 Tauri sink）
        console.log(JSON.stringify(entry));
      }
    });

    // Tauri IPC sink：通过 invoke 写入 Rust 后端日志文件
    this.initTauriSink();
  }

  /** 检测 Tauri 环境并注册 IPC sink */
  private initTauriSink() {
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
    if (!isTauri) return;

    import("@tauri-apps/api/core")
      .then(({ invoke }) => {
        this.addSink((entry) => {
          invoke("log_entry", { entry: JSON.stringify(entry) }).catch(() => {
            // IPC 失败时不递归日志，直接忽略
          });
        });
      })
      .catch(() => {
        // Tauri core 未加载，静默跳过
      });
  }

  /** 注册自定义输出目标 */
  addSink(sink: LogSink) {
    this.sinks.push(sink);
  }

  private emit(entry: LogEntry) {
    const full: LogEntry = { ...entry, trace_id: this.traceId };
    for (const sink of this.sinks) sink(full);
  }

  info(message: string, context?: ErrorContext) {
    this.emit({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message,
      context,
    });
  }

  warn(code: ErrorCode, message: string, context?: ErrorContext) {
    this.emit({
      timestamp: new Date().toISOString(),
      level: "WARN",
      message,
      error_code: code,
      context,
    });
  }

  error(err: AppError) {
    this.emit({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: err.message,
      error_code: err.code,
      error: err.toJSON(),
      context: err.context,
    });
  }

  /** 捕获并记录任意 unknown error */
  capture(err: unknown, fallbackCode: ErrorCode = "UNKNOWN_ERROR") {
    const appErr = err instanceof AppError ? err : new AppError(fallbackCode);
    this.error(appErr);
    return appErr;
  }
}

/** 全局单例 */
export const logger = new ClientLogger();
