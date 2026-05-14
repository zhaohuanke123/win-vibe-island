import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsStore } from "../store/sessions";
import { logger } from "../client/logger";
import type { Session } from "../store/sessions";

const SAVE_INTERVAL_MS = 10000; // 10 seconds

function serializeSession(s: Session): Record<string, unknown> {
  return {
    id: s.id,
    label: s.label,
    title: s.title,
    cwd: s.cwd,
    state: s.state,
    pid: s.pid,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    toolHistory: s.toolHistory.slice(-10),
    lastError: s.lastError,
    model: s.model,
    source: s.source,
    tag: s.tag,
  };
}

async function persistSessions() {
  try {
    const store = useSessionsStore.getState();
    const sessions = store.sessions;
    if (sessions.length === 0 && store.groups.length === 0) return;
    const data = sessions.map(serializeSession);
    if (store.groups.length > 0) {
      data.push({ __meta: { groups: store.groups } });
    }
    await invoke("save_sessions", { sessionsJson: JSON.stringify(data) });
  } catch (e) {
    logger.warn("STORE_OPERATION_ERROR", "Failed to persist sessions", { error: String(e) });
  }
}

async function restoreSessions() {
  try {
    const json = await invoke<string>("load_sessions");
    const data = JSON.parse(json) as Array<Record<string, unknown> & { id: string; label: string; cwd: string; state: string; createdAt: number; lastActivity: number }>;
    if (!Array.isArray(data) || data.length === 0) return;

    const store = useSessionsStore.getState();

    // Extract __meta entry for groups
    const metaEntry = data.find((item) => "__meta" in item);
    if (metaEntry && metaEntry.__meta && typeof metaEntry.__meta === "object") {
      const meta = metaEntry.__meta as { groups?: string[] };
      if (Array.isArray(meta.groups)) {
        useSessionsStore.setState({ groups: meta.groups });
      }
    }

    for (const item of data) {
      // Skip meta entries
      if ("__meta" in item) continue;
      // Skip if session already exists (from hook events)
      if (store.sessions.find((s) => s.id === item.id)) continue;

      store.addSession({
        id: item.id,
        label: item.label || "Restored",
        title: item.title as string | undefined,
        cwd: (item.cwd as string) || "",
        state: "done",
        pid: item.pid as number | undefined,
        createdAt: item.createdAt || Date.now(),
        lastActivity: item.lastActivity || Date.now(),
        toolHistory: (item.toolHistory as Session["toolHistory"]) || [],
        lastError: item.lastError as string | undefined,
        model: item.model as string | undefined,
        source: item.source as string | undefined,
        tag: item.tag as string | undefined,
      });
    }
  } catch (e) {
  }
}

export function useSessionPersistence() {
  const saveIntervalRef = useRef<number | null>(null);
  const unloadHandlerRef = useRef<(() => void) | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Load saved sessions on mount
    restoreSessions();

    // Auto-save periodically
    saveIntervalRef.current = window.setInterval(persistSessions, SAVE_INTERVAL_MS);

    // Save on page unload (app exit)
    const handleBeforeUnload = () => {
      const sessions = useSessionsStore.getState().sessions;
      if (sessions.length === 0) return;
      const data = sessions.map(serializeSession);
      invoke("save_sessions", { sessionsJson: JSON.stringify(data) }).catch(() => {});
    };
    unloadHandlerRef.current = handleBeforeUnload;
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Save when page becomes hidden (minimize, switch tab, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistSessions();
      }
    };
    visibilityHandlerRef.current = handleVisibilityChange;
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      if (unloadHandlerRef.current) {
        window.removeEventListener("beforeunload", unloadHandlerRef.current);
      }
      if (visibilityHandlerRef.current) {
        document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
      }
      // Save on unmount
      persistSessions();
    };
  }, []);
}
