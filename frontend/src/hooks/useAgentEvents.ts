import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useSessionsStore } from "../store/sessions";
import type { AgentState, DiffData } from "../store/sessions";

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

// Process Watcher events
interface ProcessInfo {
  pid: number;
  name: string;
  command_line: string | null;
  detected_at: number;
  is_agent: boolean;
  agent_type: string | null;
}

interface ProcessDetectedEvent {
  process: ProcessInfo;
}

interface ProcessTerminatedEvent {
  pid: number;
  name: string;
  agent_type: string | null;
}

// Claude Code Hook events
interface HookEvent {
  hook_type: "pre_tool_use" | "notification" | "stop";
  session_id: string;
  data: Record<string, unknown>;
}

export function useAgentEvents() {
  const { addSession, removeSession, updateSessionState, updateSessionInfo, setApprovalRequest } = useSessionsStore();

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

      // Listen for process_detected events from Process Watcher
      const unlistenProcessDetected = await listen<ProcessDetectedEvent>("process_detected", (event) => {
        const { process } = event.payload;
        if (process.is_agent && process.agent_type) {
          // Create a session from the detected process
          const sessionId = `process-${process.pid}`;
          addSession({
            id: sessionId,
            label: `${process.agent_type} (PID: ${process.pid})`,
            state: "idle" as AgentState,
            pid: process.pid,
          });
        }
      });
      unlisteners.push(unlistenProcessDetected);

      // Listen for process_terminated events
      const unlistenProcessTerminated = await listen<ProcessTerminatedEvent>("process_terminated", (event) => {
        const { pid } = event.payload;
        const sessionId = `process-${pid}`;
        removeSession(sessionId);
      });
      unlisteners.push(unlistenProcessTerminated);

      // Listen for claude_hook events from HTTP Hook Server
      const unlistenHook = await listen<HookEvent>("claude_hook", (event) => {
        const { hook_type, session_id, data } = event.payload;

        switch (hook_type) {
          case "pre_tool_use": {
            const toolName = data.tool_name as string;
            const toolInput = data.tool_input as Record<string, unknown>;
            const filePath = toolInput.file_path as string | undefined;

            // Update session with tool info
            updateSessionInfo(session_id, {
              state: "running",
              toolName,
              filePath,
            });

            // Check if this is a Write or Edit tool with diff-able content
            if (toolName === "Write" || toolName === "Edit") {
              const newContent = toolInput.content as string | undefined;
              const oldContent = (toolInput.old_string as string) || "";

              if (filePath && newContent !== undefined) {
                // Create diff data for approval preview
                const diff: DiffData = {
                  fileName: filePath.split("/").pop() || filePath,
                  oldContent,
                  newContent: toolName === "Edit"
                    ? oldContent + newContent
                    : newContent,
                };

                // Set approval request with diff
                setApprovalRequest({
                  sessionId: session_id,
                  sessionLabel: `Claude Code - ${toolName}`,
                  action: `${toolName} ${filePath}`,
                  riskLevel: toolName === "Write" ? "medium" : "low",
                  timestamp: Date.now(),
                  diff,
                });
              }
            }
            break;
          }
          case "notification": {
            // Claude needs attention - check if it's an approval request
            const notificationType = (data as Record<string, unknown>).notification_type as string | undefined;
            if (notificationType === "approval_required") {
              updateSessionState(session_id, "approval");
            }
            break;
          }
          case "stop": {
            // Claude finished - set state to done
            updateSessionState(session_id, "done");
            break;
          }
        }
      });
      unlisteners.push(unlistenHook);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addSession, removeSession, updateSessionState, updateSessionInfo, setApprovalRequest]);
}