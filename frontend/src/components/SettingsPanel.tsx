import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../client/logger";
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

interface SoundOption {
  value: NotificationSound;
  label: string;
}

export function SettingsPanel() {
  const [sounds, setSounds] = useState<SoundOption[]>([]);
  const [selectedSound, setSelectedSound] = useState<NotificationSound>("hero");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load available sounds
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

    // Load saved preference
    const saved = localStorage.getItem("notificationSound");
    if (saved) {
      setSelectedSound(saved as NotificationSound);
    }
  }, []);

  const handleSoundChange = async (sound: NotificationSound) => {
    setSelectedSound(sound);
    localStorage.setItem("notificationSound", sound);

    // Preview the sound
    setIsLoading(true);
    try {
      await invoke("play_notification_sound", { sound });
    } catch (e) {
      logger.warn("NOTIFICATION_ERROR", "Failed to play sound", { error: String(e) });
    } finally {
      setIsLoading(false);
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
      </div>
    </div>
  );
}
