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

export interface UiConfig {
  stateColors: StateColors;
  animation: AnimationConfig;
  dimensions: UiDimensions;
}

export interface StateColors {
  idle: string;
  thinking: string;
  running: string;
  streaming: string;
  approval: string;
  error: string;
  done: string;
}

export interface AnimationConfig {
  thinkingDurationMs: number;
  runningDurationMs: number;
  streamingDurationMs: number;
  approvalDurationMs: number;
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
    compactWidth: 320,
    compactHeight: 56,
    expandedWidth: 600,
    expandedMinHeight: 400,
    expandedMaxHeight: 720,
    approvalFocusWidth: 600,
    approvalFocusHeight: 720,
    alpha: 240,
    compactBorderRadius: 26,
    expandedBorderRadius: 18,
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
      idle: "#6b7280",
      thinking: "#a78bfa",
      running: "#3b82f6",
      streaming: "#06b6d4",
      approval: "#f59e0b",
      error: "#ef4444",
      done: "#22c55e",
    },
    animation: {
      thinkingDurationMs: 1200,
      runningDurationMs: 1000,
      streamingDurationMs: 500,
      approvalDurationMs: 600,
      spring: {
        expand: { stiffness: 300, damping: 22, mass: 0.9 },
        collapse: { stiffness: 380, damping: 26, mass: 0.85 },
        transition: { stiffness: 400, damping: 30, mass: 1.0 },
        micro: { stiffness: 500, damping: 35, mass: 0.8 },
      },
    },
    dimensions: {
      barHeight: 52,
      padding: 14,
      gap: 8,
      statusDotSize: 12,
    },
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
  getStateColor: (state: string) => string;
  getAnimationDuration: (state: string) => string;
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
      set({ config, isLoading: false });
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

  getStateColor: (state) => {
    const colors = get().config.ui.stateColors;
    const key = state as keyof StateColors;
    return colors[key] ?? colors.idle;
  },

  getAnimationDuration: (state) => {
    const anim = get().config.ui.animation;
    switch (state) {
      case "thinking":
        return anim.thinkingDurationMs;
      case "running":
        return anim.runningDurationMs;
      case "streaming":
        return anim.streamingDurationMs;
      case "approval":
        return anim.approvalDurationMs;
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
