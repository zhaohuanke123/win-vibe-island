import { useState, useEffect, useRef } from "react";
import { useConfigStore } from "../store/config";
import { useSessionsStore } from "../store/sessions";
import type { ApprovalRequest } from "../store/sessions";

interface TimeoutState {
  remainingSeconds: number;
  isUrgent: boolean;
  isExpired: boolean;
  progressPercent: number;
}

export function useApprovalTimeout(request: ApprovalRequest | null): TimeoutState {
  const permissionTimeoutSecs = useConfigStore((s) => s.config.hookServer.permissionTimeoutSecs);
  const approvalTimeoutSecs = useConfigStore((s) => s.config.hookServer.approvalTimeoutSecs);
  const removeApprovalByToolUseId = useSessionsStore((s) => s.removeApprovalByToolUseId);
  const clearedRef = useRef(false);

  // Use the shorter timeout as the effective limit (Claude Code side wins)
  const effectiveTimeout = Math.min(permissionTimeoutSecs, approvalTimeoutSecs);

  const [state, setState] = useState<TimeoutState>(() => computeState(request, effectiveTimeout));

  useEffect(() => {
    if (!request) {
      clearedRef.current = false;
      return;
    }

    clearedRef.current = false;

    const tick = () => {
      const next = computeState(request, effectiveTimeout);
      setState(next);

      if (next.isExpired && !clearedRef.current) {
        clearedRef.current = true;
        removeApprovalByToolUseId(request.toolUseId);
      }
    };
    const raf = requestAnimationFrame(tick);
    const interval = setInterval(tick, 1000);

    return () => { cancelAnimationFrame(raf); clearInterval(interval); };
  }, [request, effectiveTimeout, removeApprovalByToolUseId]);

  return request
    ? state
    : { remainingSeconds: 0, isUrgent: false, isExpired: false, progressPercent: 100 };
}

function computeState(request: ApprovalRequest | null, timeoutSecs: number): TimeoutState {
  if (!request) {
    return { remainingSeconds: 0, isUrgent: false, isExpired: false, progressPercent: 100 };
  }

  const elapsed = (Date.now() - request.timestamp) / 1000;
  const remaining = Math.max(0, timeoutSecs - elapsed);
  const progressPercent = Math.max(0, (remaining / timeoutSecs) * 100);

  return {
    remainingSeconds: Math.ceil(remaining),
    isUrgent: remaining > 0 && remaining <= 10,
    isExpired: remaining <= 0,
    progressPercent,
  };
}
