import { useState, useCallback } from "react";

interface JumpToastData {
  terminalName: string;
  sessionLabel?: string;
  failed?: boolean;
}

/** Hook to manage jump toast state. Returns showToast and the current toast data. */
export function useJumpToast() {
  const [toast, setToast] = useState<JumpToastData | null>(null);

  const showToast = useCallback((terminalName: string, sessionLabel?: string, failed?: boolean) => {
    setToast({ terminalName, sessionLabel, failed });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, dismissToast };
}
