import { useEffect, useState, useCallback, memo } from "react";

const TOAST_DURATION_MS = 1500;

interface JumpToastProps {
  /** Terminal name to display (e.g. "Windows Terminal", "cmd"). */
  terminalName: string;
  /** Session label for secondary info. */
  sessionLabel?: string;
  /** Called when the toast finishes its animation. */
  onDismiss: () => void;
  "data-testid"?: string;
}

export const JumpToast = memo(function JumpToast({
  terminalName,
  sessionLabel,
  onDismiss,
  "data-testid": testId,
}: JumpToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div className="pill__toast-container" data-testid={testId}>
      <div className="pill__toast">
        <svg
          className="pill__toast-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 2 L13 8 L6 14" />
        </svg>
        <span className="pill__toast-label">
          Jumping to <span className="pill__toast-term">{terminalName}</span>
        </span>
        {sessionLabel && (
          <span className="pill__toast-term">{sessionLabel}</span>
        )}
      </div>
    </div>
  );
});

/** Hook to manage jump toast state. Returns showToast and the current toast data. */
export function useJumpToast() {
  const [toast, setToast] = useState<{ terminalName: string; sessionLabel?: string } | null>(null);

  const showToast = useCallback((terminalName: string, sessionLabel?: string) => {
    setToast({ terminalName, sessionLabel });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, dismissToast };
}
