import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsStore } from "../store/sessions";
import "./HookStatus.css";

interface HealthResponse {
  state: string;
  port: number;
  lastHeartbeat: number | null;
  uptimeSecs: number | null;
  totalRequests: number;
  errorCount: number;
  pendingApprovals: number;
}

interface HookStatusProps {
  "data-testid"?: string;
}

export function HookStatus({ "data-testid": testId }: HookStatusProps = {}) {
  const { hookServerStatus, setHookServerStatus, addErrorLog } = useSessionsStore();
  const heartbeatRef = useRef<number | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  // Heartbeat check every 5 seconds
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`http://localhost:${hookServerStatus.port}/hooks/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const health: HealthResponse = await response.json();
          setHookServerStatus({
            connectionState: "connected",
            lastHeartbeat: health.lastHeartbeat ? health.lastHeartbeat * 1000 : undefined,
            requestCount: health.totalRequests,
            uptime: health.uptimeSecs ?? undefined,
            pendingApprovals: health.pendingApprovals,
          });
          setConsecutiveFailures(0);
        } else {
          const failures = consecutiveFailures + 1;
          setConsecutiveFailures(failures);
          // Only mark as error after 3 consecutive failures
          if (failures >= 3) {
            setHookServerStatus({
              connectionState: "error",
              error: `Server returned ${response.status}`,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const failures = consecutiveFailures + 1;
        setConsecutiveFailures(failures);
        // Only mark as disconnected after 3 consecutive failures
        if (failures >= 3) {
          setHookServerStatus({
            connectionState: "disconnected",
            error: errorMsg,
          });
          addErrorLog(`Hook server health check failed: ${errorMsg}`);
        }
      }
    };

    // Initial check
    checkHealth();

    // Periodic heartbeat
    heartbeatRef.current = window.setInterval(checkHealth, 5000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
    };
  }, [hookServerStatus.port, setHookServerStatus, addErrorLog]);

  // Auto-reconnect on disconnect
  useEffect(() => {
    if (hookServerStatus.connectionState === "disconnected") {
      reconnectRef.current = window.setTimeout(() => {
        invoke("get_hook_server_status").then((status) => {
          const s = status as { running: boolean; port: number };
          if (s.running) {
            setHookServerStatus({
              connectionState: "connected",
              port: s.port,
              lastHeartbeat: Date.now(),
            });
          }
        }).catch((err) => {
          addErrorLog(`Failed to check hook server status: ${err}`);
        });
      }, 3000);
    }
  }, [hookServerStatus.connectionState, setHookServerStatus, addErrorLog]);

  const statusClass = `hook-status hook-status--${hookServerStatus.connectionState}`;
  const statusText = {
    connected: "Connected",
    disconnected: "Disconnected",
    error: "Error",
    unknown: "Checking...",
  }[hookServerStatus.connectionState];

  return (
    <div className={statusClass} data-testid={testId}>
      <span className="hook-status__dot" title={statusText} />
      {hookServerStatus.error && (
        <span className="hook-status__error" title={hookServerStatus.error}>⚠</span>
      )}
    </div>
  );
}
