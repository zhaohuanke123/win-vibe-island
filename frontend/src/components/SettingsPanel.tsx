import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../client/logger";
import { useConfigStore } from "../store/config";
import { useNotificationSound } from "../hooks/useNotificationSound";
import "./SettingsPanel.css";

type NotificationSound =
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

interface ClaudeUsage {
  fiveHourPercent: number | null;
  sevenDayPercent: number | null;
  fiveHourResetAt: string | null;
  sevenDayResetAt: string | null;
  available: boolean;
}

function usageColor(pct: number | null): string {
  if (pct === null) return "usage-bar__fill--none";
  if (pct >= 80) return "usage-bar__fill--red";
  if (pct >= 50) return "usage-bar__fill--yellow";
  return "usage-bar__fill--green";
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

export function SettingsPanel() {
  const { sounds, selectedSound, setSelectedSound } = useNotificationSound();
  const [isLoading, setIsLoading] = useState(false);
  const [hookStatus, setHookStatus] = useState<HookConfigStatus | null>(null);
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const notificationsEnabled = useConfigStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useConfigStore((s) => s.setNotificationsEnabled);

  useEffect(() => {
    invoke<HookConfigStatus>("check_hook_config")
      .then((status) => setHookStatus(status))
      .catch((e) => logger.warn("HOOK_CONFIG_ERROR", "Failed to load hook status", { error: String(e) }));
  }, []);

  useEffect(() => {
    invoke<ClaudeUsage>("get_claude_usage")
      .then((data) => setUsage(data))
      .catch(() => {});
  }, []);

  const handleSoundChange = async (sound: NotificationSound) => {
    setSelectedSound(sound);
    localStorage.setItem("notificationSound", sound);

    setIsLoading(true);
    try {
      await invoke("play_notification_sound", { sound });
    } catch (e) {
      logger.warn("NOTIFICATION_ERROR", "Failed to play sound", { error: String(e) });
    } finally {
      setIsLoading(false);
    }
  };

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

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return null;
    return new Date(ts * 1000).toLocaleString();
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "installed": return "installed";
      case "missing": return "missing";
      case "external": return "external";
      default: return s;
    }
  };

  return (
    <div className="settings-panel" data-testid="settings-panel">
      <div className="settings-panel__header">
        <h3>Settings</h3>
      </div>
      <div className="settings-panel__content">
        <div className="settings-panel__section">
          <label className="settings-panel__label">
            Notification Sound
          </label>
          <div className="settings-panel__sound-list">
            {sounds.map(({ value, label }) => (
              <button
                key={value}
                className={`settings-panel__sound-btn ${
                  selectedSound === value
                    ? "settings-panel__sound-btn--selected"
                    : ""
                }`}
                onClick={() => handleSoundChange(value)}
                disabled={isLoading}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-panel__section">
          <label className="settings-panel__label">
            Desktop Notifications
          </label>
          <label className="settings-panel__toggle">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
            />
            <span>{notificationsEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
        <div className="settings-panel__section">
          <label className="settings-panel__label">Claude Code Usage</label>
          {usage && usage.available ? (
            <div className="settings-panel__usage">
              <div className="settings-panel__usage-row">
                <span className="settings-panel__usage-label">5h Window</span>
                <div className="settings-panel__usage-bar-wrap">
                  <div className="settings-panel__usage-bar">
                    <div
                      className={`settings-panel__usage-bar-fill ${usageColor(usage.fiveHourPercent)}`}
                      style={{ width: `${usage.fiveHourPercent ?? 0}%` }}
                    />
                  </div>
                  <span className="settings-panel__usage-pct">
                    {usage.fiveHourPercent !== null ? `${usage.fiveHourPercent}%` : "--"}
                  </span>
                </div>
                <span className="settings-panel__usage-reset">
                  Resets {formatResetTime(usage.fiveHourResetAt)}
                </span>
              </div>
              <div className="settings-panel__usage-row">
                <span className="settings-panel__usage-label">7d Window</span>
                <div className="settings-panel__usage-bar-wrap">
                  <div className="settings-panel__usage-bar">
                    <div
                      className={`settings-panel__usage-bar-fill ${usageColor(usage.sevenDayPercent)}`}
                      style={{ width: `${usage.sevenDayPercent ?? 0}%` }}
                    />
                  </div>
                  <span className="settings-panel__usage-pct">
                    {usage.sevenDayPercent !== null ? `${usage.sevenDayPercent}%` : "--"}
                  </span>
                </div>
                <span className="settings-panel__usage-reset">
                  Resets {formatResetTime(usage.sevenDayResetAt)}
                </span>
              </div>
            </div>
          ) : (
            <div className="settings-panel__usage-empty">
              No usage data available
            </div>
          )}
        </div>
        <div className="settings-panel__section">
          <label className="settings-panel__label">Hook Status</label>
          {hookStatus ? (
            <div className="settings-panel__hook-status">
              <div className="settings-panel__hook-summary">
                <span
                  className={`settings-panel__hook-badge ${
                    hookStatus.configured
                      ? "settings-panel__hook-badge--ok"
                      : hookStatus.partial
                        ? "settings-panel__hook-badge--partial"
                        : "settings-panel__hook-badge--missing"
                  }`}
                >
                  {hookStatus.configured
                    ? "All hooks installed"
                    : hookStatus.partial
                      ? `${hookStatus.missingHooks.length} missing`
                      : "Not configured"}
                </span>
                {hookStatus.manifestPresent && (
                  <span className="settings-panel__hook-manifest">
                    Managed (v{hookStatus.manifestAppVersion})
                  </span>
                )}
              </div>
              {hookStatus.hookDetails.length > 0 && (
                <div className="settings-panel__hook-details">
                  {hookStatus.hookDetails.map(([name, status]) => (
                    <div
                      key={name}
                      className={`settings-panel__hook-item settings-panel__hook-item--${statusLabel(status)}`}
                    >
                      <span className="settings-panel__hook-item__dot" />
                      <span className="settings-panel__hook-item__name">{name}</span>
                    </div>
                  ))}
                </div>
              )}
              {hookStatus.manifestInstalledAt && (
                <div className="settings-panel__hook-time">
                  Installed: {formatTimestamp(hookStatus.manifestInstalledAt)}
                </div>
              )}
              <div className="settings-panel__hook-actions">
                <button
                  className="settings-panel__hook-btn"
                  onClick={handleInstallHooks}
                >
                  Install Hooks
                </button>
                <button
                  className="settings-panel__hook-btn settings-panel__hook-btn--danger"
                  onClick={handleUninstallHooks}
                >
                  Remove Hooks
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-panel__hook-status">
              <span className="settings-panel__hook-badge settings-panel__hook-badge--missing">
                Loading...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
