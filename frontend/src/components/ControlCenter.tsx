import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { logger } from "../client/logger";
import { useConfigStore, type NotificationSound, type StateIndicatorKind, type DensityMode } from "../store/config";
import "./ControlCenter.css";

// ── Types ──

interface HookConfigStatus {
  configured: boolean;
  partial: boolean;
  mode: string;
  settingsPath: string | null;
  configuredHooks: string[];
  missingHooks: string[];
  manifestPresent: boolean;
  manifestInstalledAt: number | null;
  manifestAppVersion: string | null;
  hookDetails: [string, string][];
}

interface ClaudeUsage {
  fiveHourPercent: number | null;
  sevenDayPercent: number | null;
  fiveHourResetAt: string | null;
  sevenDayResetAt: string | null;
  available: boolean;
}

interface SoundOption {
  value: NotificationSound;
  label: string;
}

type TabId = "hooks" | "usage" | "terminals" | "settings" | "shortcuts";

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "hooks", label: "Hooks" },
  { id: "usage", label: "Usage" },
  { id: "terminals", label: "Terminals" },
  { id: "settings", label: "Settings" },
  { id: "shortcuts", label: "Shortcuts" },
];

const TERMINALS = [
  { name: "Windows Terminal", id: "wt" },
  { name: "PowerShell", id: "powershell" },
  { name: "Command Prompt", id: "cmd" },
  { name: "Git Bash", id: "git-bash" },
  { name: "Alacritty", id: "alacritty" },
  { name: "WezTerm", id: "wezterm" },
  { name: "Tabby", id: "tabby" },
  { name: "Cmder", id: "cmder" },
];

const SHORTCUTS = [
  { keys: "Ctrl+Alt+Space", action: "Show / Hide overlay" },
  { keys: "Enter", action: "Approve (primary action)" },
  { keys: "Escape", action: "Dismiss / collapse overlay" },
  { keys: "1 / 2 / 3", action: "Pick option in multi-choice prompts" },
  { keys: "← / →", action: "Navigate approval queue" },
];

// ── Helpers ──

function usageColor(pct: number | null): string {
  if (pct === null) return "cc-usage__fill--none";
  if (pct >= 80) return "cc-usage__fill--red";
  if (pct >= 50) return "cc-usage__fill--yellow";
  return "cc-usage__fill--green";
}

function formatResetTime(iso: string | null): string {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--";
  }
}

function formatTimestamp(ts: number | null): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleString();
}

function hookStatusLabel(s: string): string {
  switch (s) {
    case "installed": return "installed";
    case "missing": return "missing";
    case "external": return "external";
    default: return s;
  }
}

// ── Tab Content Components ──

function HooksTab() {
  const [hookStatus, setHookStatus] = useState<HookConfigStatus | null>(null);

  useEffect(() => {
    invoke<HookConfigStatus>("check_hook_config")
      .then((status) => setHookStatus(status))
      .catch((e) => logger.warn("HOOK_CONFIG_ERROR", "Failed to load hook status", { error: String(e) }));
  }, []);

  const handleInstallHooks = async () => {
    try {
      await invoke("install_hooks");
      const status = await invoke<HookConfigStatus>("check_hook_config");
      setHookStatus(status);
    } catch (e) {
      logger.warn("HOOK_CONFIG_ERROR", "Failed to install hooks", { error: String(e) });
    }
  };

  const handleUninstallHooks = async () => {
    try {
      await invoke("uninstall_hooks");
      const status = await invoke<HookConfigStatus>("check_hook_config");
      setHookStatus(status);
    } catch (e) {
      logger.warn("HOOK_CONFIG_ERROR", "Failed to uninstall hooks", { error: String(e) });
    }
  };

  if (!hookStatus) {
    return (
      <div className="cc-section">
        <span className="cc-badge cc-badge--missing">Loading...</span>
      </div>
    );
  }

  return (
    <div className="cc-section" data-testid="cc-hooks">
      <div className="cc-section__head">
        <span className="cc-label">Hook Status</span>
        <span
          className={`cc-badge ${
            hookStatus.configured
              ? "cc-badge--ok"
              : hookStatus.partial
                ? "cc-badge--partial"
                : "cc-badge--missing"
          }`}
        >
          {hookStatus.configured
            ? "All hooks installed"
            : hookStatus.partial
              ? `${hookStatus.missingHooks.length} missing`
              : "Not configured"}
        </span>
      </div>
      {hookStatus.manifestPresent && (
        <span className="cc-hint">Managed (v{hookStatus.manifestAppVersion})</span>
      )}
      {hookStatus.hookDetails.length > 0 && (
        <div className="cc-hook-grid">
          {hookStatus.hookDetails.map(([name, status]) => (
            <div key={name} className={`cc-hook-item cc-hook-item--${hookStatusLabel(status)}`}>
              <span className="cc-hook-item__dot" />
              <span className="cc-hook-item__name">{name}</span>
            </div>
          ))}
        </div>
      )}
      {hookStatus.manifestInstalledAt && (
        <span className="cc-hint">Installed: {formatTimestamp(hookStatus.manifestInstalledAt)}</span>
      )}
      <div className="cc-hook-actions">
        <button className="cc-btn" onClick={handleInstallHooks}>
          Install Hooks
        </button>
        <button className="cc-btn cc-btn--danger" onClick={handleUninstallHooks}>
          Remove Hooks
        </button>
      </div>
    </div>
  );
}

function UsageTab() {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);

  useEffect(() => {
    invoke<ClaudeUsage>("get_claude_usage")
      .then((data) => setUsage(data))
      .catch(() => {});
  }, []);

  return (
    <div className="cc-section" data-testid="cc-usage">
      <span className="cc-label">Claude Code Usage</span>
      {usage && usage.available ? (
        <div className="cc-usage">
          <div className="cc-usage__row">
            <span className="cc-usage__label">5h Window</span>
            <div className="cc-usage__bar-wrap">
              <div className="cc-usage__bar">
                <div
                  className={`cc-usage__fill ${usageColor(usage.fiveHourPercent)}`}
                  style={{ width: `${usage.fiveHourPercent ?? 0}%` }}
                />
              </div>
              <span className="cc-usage__pct">
                {usage.fiveHourPercent !== null ? `${usage.fiveHourPercent}%` : "--"}
              </span>
            </div>
            <span className="cc-hint">Resets {formatResetTime(usage.fiveHourResetAt)}</span>
          </div>
          <div className="cc-usage__row">
            <span className="cc-usage__label">7d Window</span>
            <div className="cc-usage__bar-wrap">
              <div className="cc-usage__bar">
                <div
                  className={`cc-usage__fill ${usageColor(usage.sevenDayPercent)}`}
                  style={{ width: `${usage.sevenDayPercent ?? 0}%` }}
                />
              </div>
              <span className="cc-usage__pct">
                {usage.sevenDayPercent !== null ? `${usage.sevenDayPercent}%` : "--"}
              </span>
            </div>
            <span className="cc-hint">Resets {formatResetTime(usage.sevenDayResetAt)}</span>
          </div>
        </div>
      ) : (
        <span className="cc-empty">No usage data available</span>
      )}
    </div>
  );
}

function TerminalsTab() {
  // In the future this can detect installed terminals via process_watcher.
  // For now, show a static grid.
  return (
    <div className="cc-section" data-testid="cc-terminals">
      <span className="cc-label">Supported Terminals</span>
      <div className="cc-terminal-grid">
        {TERMINALS.map((t) => (
          <div key={t.id} className="cc-terminal-card">
            <span className="cc-terminal-card__name">{t.name}</span>
            <span className="cc-terminal-card__status">Supported</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const [sounds, setSounds] = useState<SoundOption[]>([]);
  const [selectedSound, setSelectedSound] = useState<NotificationSound>("hero");
  const [isPlaying, setIsPlaying] = useState(false);
  const notificationsEnabled = useConfigStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useConfigStore((s) => s.setNotificationsEnabled);
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.updateConfig);

  useEffect(() => {
    invoke<[NotificationSound, string][]>("get_notification_sounds")
      .then((soundList) => {
        setSounds(
          soundList.map(([value, label]) => ({
            value: value.toLowerCase() as NotificationSound,
            label,
          }))
        );
      })
      .catch((e) => logger.warn("NOTIFICATION_ERROR", "Failed to load sounds", { error: String(e) }));

    const saved = localStorage.getItem("notificationSound");
    if (saved) {
      setSelectedSound(saved as NotificationSound);
    }
  }, []);

  const handleSoundChange = async (sound: NotificationSound) => {
    setSelectedSound(sound);
    localStorage.setItem("notificationSound", sound);
    setIsPlaying(true);
    try {
      await invoke("play_notification_sound", { sound });
    } catch (e) {
      logger.warn("NOTIFICATION_ERROR", "Failed to play sound", { error: String(e) });
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <div className="cc-section" data-testid="cc-settings">
      {/* Display Density */}
      <div className="cc-setting-row">
        <span className="cc-label">Display Density</span>
        <div className="cc-toggle-group">
          <button
            className={`cc-toggle-btn ${config.ui.density === "comfortable" ? "cc-toggle-btn--active" : ""}`}
            onClick={() => updateConfig({ ui: { ...config.ui, density: "comfortable" as DensityMode } })}
          >
            Comfortable
          </button>
          <button
            className={`cc-toggle-btn ${config.ui.density === "compact" ? "cc-toggle-btn--active" : ""}`}
            onClick={() => updateConfig({ ui: { ...config.ui, density: "compact" as DensityMode } })}
          >
            Compact
          </button>
        </div>
      </div>

      {/* State Indicator */}
      <div className="cc-setting-row">
        <span className="cc-label">State Indicator</span>
        <div className="cc-toggle-group">
          {(["dot", "bar", "glyph", "tint"] as StateIndicatorKind[]).map((kind) => (
            <button
              key={kind}
              className={`cc-toggle-btn ${config.ui.stateIndicator === kind ? "cc-toggle-btn--active" : ""}`}
              onClick={() => updateConfig({ ui: { ...config.ui, stateIndicator: kind } })}
            >
              {kind.charAt(0).toUpperCase() + kind.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Notification Sound */}
      <div className="cc-setting-row">
        <span className="cc-label">Notification Sound</span>
        <div className="cc-sound-grid">
          {sounds.map(({ value, label }) => (
            <button
              key={value}
              className={`cc-sound-btn ${selectedSound === value ? "cc-sound-btn--selected" : ""}`}
              onClick={() => handleSoundChange(value)}
              disabled={isPlaying}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Notifications */}
      <div className="cc-setting-row">
        <span className="cc-label">Desktop Notifications</span>
        <label className="cc-switch">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
          />
          <span className="cc-switch__slider" />
          <span className="cc-switch__text">{notificationsEnabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
    </div>
  );
}

function ShortcutsTab() {
  return (
    <div className="cc-section" data-testid="cc-shortcuts">
      <span className="cc-label">Keyboard Shortcuts</span>
      <div className="cc-shortcut-list">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="cc-shortcut-item">
            <kbd className="cc-shortcut__keys">{s.keys}</kbd>
            <span className="cc-shortcut__action">{s.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──

export function ControlCenter() {
  const [activeTab, setActiveTab] = useState<TabId>("hooks");

  const handleClose = () => {
    getCurrentWindow().hide().catch(() => {});
  };

  return (
    <div className="cc" data-testid="control-center">
      <div className="cc__head">
        <span className="cc__title" data-tauri-drag-region>Vibe Island</span>
        <button className="cc__close" onClick={handleClose} title="Close" aria-label="Close">
          ✕
        </button>
      </div>
      <nav className="cc__tabs" data-testid="cc-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`cc__tab ${activeTab === tab.id ? "cc__tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`cc-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="cc__body">
        {activeTab === "hooks" && <HooksTab />}
        {activeTab === "usage" && <UsageTab />}
        {activeTab === "terminals" && <TerminalsTab />}
        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "shortcuts" && <ShortcutsTab />}
      </div>
    </div>
  );
}
