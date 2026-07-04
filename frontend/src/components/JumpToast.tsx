import { useEffect, useState, memo } from "react";

const TOAST_DURATION_MS = 1500;

interface JumpToastProps {
  /** Terminal name to display (e.g. "Windows Terminal", "cmd"). */
  terminalName: string;
  /** Session label for secondary info. */
  sessionLabel?: string;
  /** Show failure state instead of "Jumping to..." */
  failed?: boolean;
  /** Called when the toast finishes its animation. */
  onDismiss: () => void;
  "data-testid"?: string;
}

export const JumpToast = memo(function JumpToast({
  terminalName,
  sessionLabel,
  failed,
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
      <div className={`pill__toast${failed ? " pill__toast--failed" : ""}`}>
        {failed ? (
          <>
            <svg
              className="pill__toast-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
            <span className="pill__toast-label">未找到终端窗口</span>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
});
