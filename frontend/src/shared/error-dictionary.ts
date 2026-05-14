/* ============================================================
 * 错误码注册表 — AI 自动维护
 *
 * 约定：
 *   - 新 error code 必须在此注册，否则 AppError 取不到 aiHint
 *   - code 格式：MODULE_SUB_SPECIFIC（全大写，下划线分隔）
 *   - AI 每次修完对应 bug 后更新 aiHint
 * ============================================================ */

export interface AiHint {
  /** 优先检查的文件路径（相对于 frontend/src/） */
  checkFiles: string[];
  /** 可能的根因 */
  possibleCause: string;
  /** 修复方向描述 */
  resolutionGuide: string;
}

export interface ErrorRegistryEntry {
  /** 人类可读描述 */
  message: string;
  /** 严重级别 */
  severity: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  /** 展示给用户的文案（可选） */
  userMessage?: string;
  /** AI 修复线索（可空，由 AI 后续填充） */
  aiHint: AiHint;
}

/** 所有已注册的错误码联合类型 — AI grep 此文件可知有哪些 code */
export type ErrorCode =
  | "UNKNOWN_ERROR"
  | "TAURI_IPC_ERROR"
  | "TAURI_EVENT_ERROR"
  | "COMPONENT_RENDER_ERROR"
  | "STORE_OPERATION_ERROR"
  | "SESSION_EVENT_ERROR"
  | "SESSION_PARSE_ERROR"
  | "HOOK_LISTENER_ERROR"
  | "NOTIFICATION_ERROR";

/**
 * 错误码注册表 — 单一事实来源。
 * ⚠️ 此对象由 AI 自动维护，修完对应 bug 后更新 aiHint。
 */
export const ErrorRegistry: Record<ErrorCode, ErrorRegistryEntry> = {
  UNKNOWN_ERROR: {
    message: "An unexpected error occurred",
    severity: "ERROR",
    userMessage: "Something went wrong",
    aiHint: { checkFiles: [], possibleCause: "", resolutionGuide: "" },
  },

  TAURI_IPC_ERROR: {
    message: "Tauri IPC invoke failed",
    severity: "ERROR",
    userMessage: "Internal communication error",
    aiHint: {
      checkFiles: ["hooks/useAgentEvents.ts"],
      possibleCause: "Tauri backend command not registered or panicked",
      resolutionGuide:
        "Check src-tauri/src/commands.rs for the invoked command name",
    },
  },

  TAURI_EVENT_ERROR: {
    message: "Failed to listen to Tauri event",
    severity: "WARN",
    userMessage: "Live update unavailable",
    aiHint: {
      checkFiles: ["hooks/useAgentEvents.ts"],
      possibleCause: "Event name mismatch or backend not emitting",
      resolutionGuide:
        "Verify event name matches src-tauri/src/events.rs emission",
    },
  },

  COMPONENT_RENDER_ERROR: {
    message: "React component render error",
    severity: "ERROR",
    userMessage: "UI render error",
    aiHint: {
      checkFiles: [],
      possibleCause: "Unexpected state or null reference in render",
      resolutionGuide:
        "Check component props and store state",
    },
  },

  STORE_OPERATION_ERROR: {
    message: "Zustand store operation failed",
    severity: "ERROR",
    userMessage: "State error",
    aiHint: {
      checkFiles: ["store/sessions.ts", "store/config.ts", "store/timeline.ts", "shared/state-machine.ts"],
      possibleCause: "Invalid state mutation or missing field",
      resolutionGuide:
        "Verify the store action and payload shape match the store type",
    },
  },

  SESSION_EVENT_ERROR: {
    message: "Failed to process agent session event",
    severity: "WARN",
    aiHint: {
      checkFiles: ["hooks/useAgentEvents.ts"],
      possibleCause: "Unexpected event payload shape from Tauri backend",
      resolutionGuide:
        "Check event payload type against src-tauri event emission",
    },
  },

  SESSION_PARSE_ERROR: {
    message: "Failed to parse session data",
    severity: "WARN",
    aiHint: {
      checkFiles: ["store/sessions.ts"],
      possibleCause: "Serialized session data format changed",
      resolutionGuide:
        "Check localStorage session cache format vs current Session type",
    },
  },

  HOOK_LISTENER_ERROR: {
    message: "Hook listener setup failed",
    severity: "WARN",
    aiHint: {
      checkFiles: ["hooks/useAgentEvents.ts"],
      possibleCause: "listen() returned error during setup",
      resolutionGuide:
        "Verify Tauri event system is initialized before hook mounts",
    },
  },

  NOTIFICATION_ERROR: {
    message: "Failed to play notification sound",
    severity: "INFO",
    aiHint: {
      checkFiles: ["hooks/useAgentEvents.ts"],
      possibleCause: "Tauri play_notification_sound command failed",
      resolutionGuide:
        "Check src-tauri/src/audio.rs for sound file path or playback error",
    },
  },
};
