import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./HookConfigStatus.css";

interface HookConfigStatus {
  configured: boolean;
  partial: boolean;
  mode: "auto" | "autoCleanup" | "manual";
  settingsPath: string | null;
  configuredHooks: string[];
  missingHooks: string[];
}

type HookConfigMode = "auto" | "autoCleanup" | "manual";

export function HookConfigStatusPanel() {
  const [status, setStatus] = useState<HookConfigStatus | null>(null);
  const [selectedMode, setSelectedMode] = useState<HookConfigMode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<HookConfigStatus>("check_hook_config");
      setStatus(result);
      // Read stored mode from config file
      const storedMode = await invoke<HookConfigMode>("get_hook_config_mode");
      setSelectedMode(storedMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const installHooks = async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke<string>("install_hooks");
      // Re-check status after installation
      await checkConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const uninstallHooks = async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke("uninstall_hooks");
      // Re-check status after removal
      await checkConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const setMode = async (mode: HookConfigMode) => {
    setLoading(true);
    setError(null);
    try {
      await invoke("set_hook_config_mode", { mode });
      setSelectedMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Check config on mount
  useEffect(() => {
    checkConfig();
  }, []);

  if (loading && !status) {
    return (
      <div className="hook-config-status hook-config-status--loading">
        <span className="hook-config-status__loading">Checking hook configuration...</span>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="hook-config-status hook-config-status--error">
        <span className="hook-config-status__error">Error: {error}</span>
        <button onClick={checkConfig} className="hook-config-status__button">
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const statusClass = `hook-config-status hook-config-status--${
    status.configured ? "configured" : status.partial ? "partial" : "not-configured"
  }`;

  return (
    <div className={statusClass}>
      <div className="hook-config-status__header">
        <span className="hook-config-status__icon">
          {status.configured ? "✓" : status.partial ? "⚠" : "✗"}
        </span>
        <span className="hook-config-status__title">
          {status.configured
            ? "Hooks Configured"
            : status.partial
            ? "Partial Configuration"
            : "Hooks Not Configured"}
        </span>
      </div>

      {status.settingsPath && (
        <div className="hook-config-status__path">
          <span className="hook-config-status__label">Settings:</span>
          <span className="hook-config-status__value" title={status.settingsPath}>
            {status.settingsPath}
          </span>
        </div>
      )}

      {status.configuredHooks.length > 0 && (
        <div className="hook-config-status__hooks">
          <span className="hook-config-status__label">Configured:</span>
          <span className="hook-config-status__hooks-list">
            {status.configuredHooks.join(", ")}
          </span>
        </div>
      )}

      {status.missingHooks.length > 0 && (
        <div className="hook-config-status__missing">
          <span className="hook-config-status__label">Missing:</span>
          <span className="hook-config-status__hooks-list">
            {status.missingHooks.join(", ")}
          </span>
        </div>
      )}

      {/* Configuration mode selector */}
      <div className="hook-config-status__mode">
        <span className="hook-config-status__label">Mode:</span>
        <select
          value={selectedMode}
          onChange={(e) => setMode(e.target.value as HookConfigMode)}
          disabled={loading}
          className="hook-config-status__select"
        >
          <option value="auto">Auto (keep on exit)</option>
          <option value="autoCleanup">Auto-cleanup (remove on exit)</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div className="hook-config-status__actions">
        {!status.configured && (
          <button
            onClick={installHooks}
            disabled={loading}
            className="hook-config-status__button hook-config-status__button--primary"
          >
            {loading ? "Installing..." : "Install Hooks"}
          </button>
        )}
        {status.configured && (
          <button
            onClick={uninstallHooks}
            disabled={loading}
            className="hook-config-status__button hook-config-status__button--danger"
          >
            {loading ? "Removing..." : "Remove Hooks"}
          </button>
        )}
        <button
          onClick={checkConfig}
          disabled={loading}
          className="hook-config-status__button"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="hook-config-status__error-msg">
          Error: {error}
        </div>
      )}
    </div>
  );
}
