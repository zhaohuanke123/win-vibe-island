import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../client/logger";
import type { NotificationSound } from "../store/config";

export interface SoundOption {
  value: NotificationSound;
  label: string;
}

const STORAGE_KEY = "notificationSound";
const DEFAULT_SOUND: NotificationSound = "hero";

/**
 * 通知音选择：sounds 列表异步从后端加载，selectedSound 用 localStorage lazy 初始化。
 * 抽出以复用（SettingsPanel + ControlCenter），并避免 effect 内同步 setState（React Compiler 合规）。
 */
export function useNotificationSound() {
  const [sounds, setSounds] = useState<SoundOption[]>([]);
  const [selectedSound, setSelectedSound] = useState<NotificationSound>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as NotificationSound | null;
    return saved ?? DEFAULT_SOUND;
  });

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
  }, []);

  return { sounds, selectedSound, setSelectedSound };
}
