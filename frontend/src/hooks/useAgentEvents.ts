import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useSessionsStore } from "../store/sessions";
import type { AgentState } from "../store/sessions";

interface SessionStartEvent {
  session_id: string;
  label: string;
  pid?: number;
}

interface SessionEndEvent {
  session_id: string;
}

interface StateChangeEvent {
  session_id: string;
  state: string;
}

export function useAgentEvents() {
  const { addSession, removeSession, updateSessionState } = useSessionsStore();

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for session_start events
      const unlistenStart = await listen<SessionStartEvent>("session_start", (event) => {
        const { session_id, label, pid } = event.payload;
        addSession({
          id: session_id,
          label,
          state: "idle" as AgentState,
          pid,
        });
      });
      unlisteners.push(unlistenStart);

      // Listen for session_end events
      const unlistenEnd = await listen<SessionEndEvent>("session_end", (event) => {
        removeSession(event.payload.session_id);
      });
      unlisteners.push(unlistenEnd);

      // Listen for state_change events
      const unlistenState = await listen<StateChangeEvent>("state_change", (event) => {
        const { session_id, state } = event.payload;
        const validState = ["idle", "running", "approval", "done"].includes(state)
          ? state as AgentState
          : "idle";
        updateSessionState(session_id, validState);
      });
      unlisteners.push(unlistenState);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addSession, removeSession, updateSessionState]);
}