import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsStore } from "../store/sessions";
import type { Session } from "../store/sessions";

const SAVE_INTERVAL_MS = 30000; // 30 seconds

function serializeSession(s: Session): Record<string, unknown> {
  return {
    id: s.id,
    label: s.label,
    cwd: s.cwd,
    state: s.state,
    pid: s.pid,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    toolHistory: s.toolHistory.slice(-10),
    lastError: s.lastError,
    model: s.model,
    source: s.source,
  };
}

async function persistSessions() {
  try {
    const sessions = useSessionsStore.getState().sessions;
    if (sessions.length === 0) return;
    const data = sessions.map(serializeSession);
    await invoke("save_sessions", { sessionsJson: JSON.stringify(data) });
  } catch (e) {
    console.error("Failed to persist sessions:", e);
  }
}

async function restoreSessions() {
  try {
    const json = await invoke<string>("load_sessions");
    const data = JSON.parse(json) as Array<Record<string, unknown> & { id: string; label: string; cwd: string; state: string; createdAt: number; lastActivity: number }>;
    if (!Array.isArray(data) || data.length === 0) return;

    const store = useSessionsStore.getState();
    for (const item of data) {
      // Skip if session already exists (from hook events)
      if (store.sessions.find((s) => s.id === item.id)) continue;

      store.addSession({
        id: item.id,
        label: item.label || "Restored",
        cwd: (item.cwd as string) || "",
        state: "done", // Historical sessions are done
        pid: item.pid as number | undefined,
        createdAt: item.createdAt || Date.now(),
        lastActivity: item.lastActivity || Date.now(),
        toolHistory: (item.toolHistory as Session["toolHistory"]) || [],
        lastError: item.lastError as string | undefined,
        model: item.model as string | undefined,
        source: item.source as string | undefined,
      });
    }
    console.log(`[useSessionPersistence] Restored ${data.length} sessions`);
  } catch (e) {
    console.error("Failed to restore sessions:", e);
  }
}

export function useSessionPersistence() {
  const saveIntervalRef = useRef<number | null>(null);
  const unloadHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Load saved sessions on mount
    restoreSessions();

    // Auto-save periodically
    saveIntervalRef.current = window.setInterval(persistSessions, SAVE_INTERVAL_MS);

    // Save on page unload (app exit)
    const handleBeforeUnload = () => {
      // Use synchronous invoke is not available, but we try our best
      const sessions = useSessionsStore.getState().sessions;
      if (sessions.length === 0) return;
      const data = sessions.map(serializeSession);
      // Fire-and-forget - may not complete before window closes
      invoke("save_sessions", { sessionsJson: JSON.stringify(data) }).catch(() => {});
    };
    unloadHandlerRef.current = handleBeforeUnload;
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      if (unloadHandlerRef.current) {
        window.removeEventListener("beforeunload", unloadHandlerRef.current);
      }
      // Save on unmount
      persistSessions();
    };
  }, []);
}
