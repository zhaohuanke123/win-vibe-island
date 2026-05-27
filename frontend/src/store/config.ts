/**
 * Application Configuration Store
 *
 * Manages configuration synced from Rust backend.
 * Provides type-safe access to all configuration values.
 */

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../client/logger";

// ============================================================================
// Configuration Types (synced with Rust backend)
// ============================================================================

export interface AppConfig {
  version: number;
  hookServer: HookServerConfig;
  pipeServer: PipeServerConfig;
  overlay: OverlayConfigDefaults;
  processWatcher: ProcessWatcherConfig;
  audio: AudioConfig;
  ui: UiConfig;
}

export interface HookServerConfig {
  port: number;
  approvalTimeoutSecs: number;
  preToolTimeoutSecs: number;
  permissionTimeoutSecs: number;
  maxErrorLogs: number;
}

export interface PipeServerConfig {
  pipeName: string;
  retryIntervalMs: number;
  bufferSize: number;
}

export interface OverlayConfigDefaults {
  defaultX: number;
  defaultY: number;
  compactWidth: number;
  compactHeight: number;
  expandedWidth: number;
  expandedMinHeight: number;
  expandedMaxHeight: number;
  approvalFocusWidth: number;
  approvalFocusHeight: number;
  alpha: number;
  compactBorderRadius: number;
  expandedBorderRadius: number;
  snapPosition: "top" | "bottom";
}

export interface ProcessWatcherConfig {
  pollIntervalMs: number;
  detectNodeClaude: boolean;
}

export interface AudioConfig {
  defaultSound: NotificationSound;
  soundsDir?: string;
}

export type NotificationSound =
  | "none"
  | "pop"
  | "ping"
  | "glass"
  | "hero"
  | "blow"
  | "bottle"
  | "frog"
  | "funk"
  | "morse"
  | "purr"
  | "tink";

export type StateIndicatorKind = "dot" | "bar" | "glyph" | "tint";

export type DensityMode = "comfortable" | "compact";

export interface UiConfig {
  stateColors: StateColors;
  animation: AnimationConfig;
  dimensions: UiDimensions;
  stateIndicator: StateIndicatorKind;
  density: DensityMode;
}

export interface StateColors {
  idle: string;
  running: string;
  waitingForApproval: string;
  waitingForAnswer: string;
  completed: string;
}

export interface AnimationConfig {
  runningDurationMs: number;
  waitingForApprovalDurationMs: number;
  waitingForAnswerDurationMs: number;
  spring: SpringConfig;
}

export interface SpringConfig {
  expand: SpringParams;
  collapse: SpringParams;
  transition: SpringParams;
  micro: SpringParams;
}

export interface SpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface UiDimensions {
  barHeight: number;
  padding: number;
  gap: number;
  statusDotSize: number;
}

// ============================================================================
// Default Values (fallback when config not loaded)
// ============================================================================

export const OVERLAY_LAYOUT_MINIMUMS = {
  expandedWidth: 600,
  expandedMinHeight: 400,
  expandedMaxHeight: 720,
  approvalFocusWidth: 600,
  approvalFocusHeight: 720,
} as const;

export function normalizeOverlayLayoutConfig(overlay: OverlayConfigDefaults) {
  const expandedWidth = Math.max(overlay.expandedWidth, OVERLAY_LAYOUT_MINIMUMS.expandedWidth);
  const expandedMinHeight = Math.max(
    overlay.expandedMinHeight,
    OVERLAY_LAYOUT_MINIMUMS.expandedMinHeight,
  );
  const expandedMaxHeight = Math.max(
    overlay.expandedMaxHeight,
    OVERLAY_LAYOUT_MINIMUMS.expandedMaxHeight,
    expandedMinHeight,
  );

  return {
    ...overlay,
    expandedWidth,
    expandedMinHeight,
    expandedMaxHeight,
    approvalFocusWidth: Math.max(
      overlay.approvalFocusWidth,
      OVERLAY_LAYOUT_MINIMUMS.approvalFocusWidth,
    ),
    approvalFocusHeight: Math.max(
      overlay.approvalFocusHeight,
      OVERLAY_LAYOUT_MINIMUMS.approvalFocusHeight,
    ),
  };
}

const DEFAULT_CONFIG: AppConfig = {
  version: 3,
  hookServer: {
    port: 7878,
    approvalTimeoutSecs: 120,
    preToolTimeoutSecs: 30,
    permissionTimeoutSecs: 60,
    maxErrorLogs: 100,
  },
  pipeServer: {
    pipeName: "\\\\.\\pipe\\VibeIsland",
    retryIntervalMs: 10,
    bufferSize: 4096,
  },
  overlay: {
    defaultX: 100,
    defaultY: 100,
    compactWidth: 180,
    compactHeight: 32,
    expandedWidth: 600,
    expandedMinHeight: 400,
    expandedMaxHeight: 720,
    approvalFocusWidth: 600,
    approvalFocusHeight: 720,
    alpha: 240,
    compactBorderRadius: 16,
    expandedBorderRadius: 22,
    snapPosition: "top",
  },
  processWatcher: {
    pollIntervalMs: 5000,
    detectNodeClaude: true,
  },
  audio: {
    defaultSound: "hero",
  },
  ui: {
    stateColors: {
      idle: "#9a958a",
      running: "#6ea7ff",
      waitingForApproval: "#f4a4a4",
      waitingForAnswer: "#ffd58a",
      completed: "#6fb982",
    },
    animation: {
      runningDurationMs: 1000,
      waitingForApprovalDurationMs: 600,
      waitingForAnswerDurationMs: 600,
      spring: {
        expand: { stiffness: 300, damping: 30, mass: 0.8 },
        collapse: { stiffness: 300, damping: 30, mass: 0.7 },
        transition: { stiffness: 300, damping: 30, mass: 1.0 },
        micro: { stiffness: 300, damping: 30, mass: 0.8 },
      },
    },
    dimensions: {
      barHeight: 32,
      padding: 14,
      gap: 8,
      statusDotSize: 12,
    },
    stateIndicator: "dot",
    density: "comfortable",
  },
};

// ============================================================================
// Config Store
// ============================================================================

interface ConfigStore {
  config: AppConfig;
  isLoading: boolean;
  error: string | null;
  notificationsEnabled: boolean;

  // Actions
  loadConfig: () => Promise<void>;
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>;
  resetConfig: (section?: string) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => void;

  // Getters (convenience methods)
  getHookServerPort: () => number;
  getAnimationDuration: (state: string) => number;
  getSpringConfig: (type: "expand" | "collapse" | "transition" | "micro") => SpringParams;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  isLoading: false,
  error: null,
  notificationsEnabled: typeof localStorage !== "undefined"
    ? localStorage.getItem("vibe-notifications") !== "false"
    : true,

  loadConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const config = await invoke<AppConfig>("get_app_config");
      // Deep merge: Rust 返回的值覆盖，缺失的字段保留前端默认
      // 防止 Rust 端忘记同步某个字段时静默使用 undefined
      const merged = {
        ...DEFAULT_CONFIG,
        ...config,
        hookServer: { ...DEFAULT_CONFIG.hookServer, ...config.hookServer },
        pipeServer: { ...DEFAULT_CONFIG.pipeServer, ...config.pipeServer },
        overlay: { ...DEFAULT_CONFIG.overlay, ...config.overlay },
        processWatcher: { ...DEFAULT_CONFIG.processWatcher, ...config.processWatcher },
        audio: { ...DEFAULT_CONFIG.audio, ...config.audio },
        ui: {
          ...DEFAULT_CONFIG.ui,
          ...config.ui,
          stateColors: { ...DEFAULT_CONFIG.ui.stateColors, ...config.ui?.stateColors },
          animation: {
            ...DEFAULT_CONFIG.ui.animation,
            ...config.ui?.animation,
            spring: { ...DEFAULT_CONFIG.ui.animation.spring, ...config.ui?.animation?.spring },
          },
          dimensions: { ...DEFAULT_CONFIG.ui.dimensions, ...config.ui?.dimensions },
        },
      };
      set({ config: merged, isLoading: false });
    } catch (e) {
      logger.warn("STORE_OPERATION_ERROR", "Failed to load config", { error: String(e) });
      set({ error: String(e), isLoading: false });
    }
  },

  updateConfig: async (updates) => {
    try {
      const newConfig = await invoke<AppConfig>("update_app_config", {
        updates: JSON.stringify(updates),
      });
      set({ config: newConfig });
    } catch (e) {
      logger.warn("STORE_OPERATION_ERROR", "Failed to update config", { error: String(e) });
      set({ error: String(e) });
    }
  },

  resetConfig: async (section) => {
    try {
      const newConfig = await invoke<AppConfig>("reset_app_config", { section });
      set({ config: newConfig });
    } catch (e) {
      logger.warn("STORE_OPERATION_ERROR", "Failed to reset config", { error: String(e) });
      set({ error: String(e) });
    }
  },

  getHookServerPort: () => get().config.hookServer.port,

  getAnimationDuration: (state) => {
    const anim = get().config.ui.animation;
    switch (state) {
      case "running":
        return anim.runningDurationMs;
      case "waitingForApproval":
        return anim.waitingForApprovalDurationMs;
      case "waitingForAnswer":
        return anim.waitingForAnswerDurationMs;
      default:
        return 1000;
    }
  },

  getSpringConfig: (type) => get().config.ui.animation.spring[type],

  setNotificationsEnabled: (enabled) => {
    set({ notificationsEnabled: enabled });
    try { localStorage.setItem("vibe-notifications", String(enabled)); } catch {}
  },
}));

// ============================================================================
// Initialization Helper
// ============================================================================

/**
 * Initialize config store on app startup
 * Call this once when the app loads
 */
export async function initConfig() {
  await useConfigStore.getState().loadConfig();
}
