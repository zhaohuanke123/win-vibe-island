import { useEffect, useRef } from "react";
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

export function HookStatus() {
  const { hookServerStatus, setHookServerStatus, addErrorLog } = useSessionsStore();
  const heartbeatRef = useRef<number | null>(null);
  const reconnectRef = useRef<number | null>(null);

  // Heartbeat check every 5 seconds
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`http://localhost:${hookServerStatus.port}/hooks/health`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
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
        } else {
          setHookServerStatus({
            connectionState: "error",
            error: `Server returned ${response.status}`,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setHookServerStatus({
          connectionState: "disconnected",
          error: errorMsg,
        });
        addErrorLog(`Hook server health check failed: ${errorMsg}`);
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

  // Format uptime as human readable
  const formatUptime = (secs: number): string => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className={statusClass}>
      <span className="hook-status__dot" />
      <span className="hook-status__text">{statusText}</span>
      {hookServerStatus.connectionState === "connected" && (
        <span className="hook-status__stats">
          {hookServerStatus.requestCount !== undefined && (
            <span title="Total requests">📊{hookServerStatus.requestCount}</span>
          )}
          {hookServerStatus.pendingApprovals !== undefined && hookServerStatus.pendingApprovals > 0 && (
            <span title="Pending approvals">⏳{hookServerStatus.pendingApprovals}</span>
          )}
          {hookServerStatus.uptime !== undefined && (
            <span title="Uptime">⏱️{formatUptime(hookServerStatus.uptime)}</span>
          )}
        </span>
      )}
      {hookServerStatus.error && (
        <span className="hook-status__error" title={hookServerStatus.error}>⚠</span>
      )}
    </div>
  );
}
