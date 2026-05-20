import { useState, useEffect, useCallback, useRef, memo } from "react";
import type { Session, NotifKind, QuestionOption } from "../store/sessions";
import "./NotifBody.css";

/** Strip markdown code fences from preview text */
function stripCodeFences(text: string): string {
  return text.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
}

// ─── Public types ──────────────────────────────────────────────────────────

// NotifKind is re-exported from sessions for convenience
export type { NotifKind };

export interface NotifAction {
  label: string;
  variant?: "primary" | "danger" | "default" | "amber";
  key?: string; // keyboard shortcut hint, e.g. "1", "2", "↵"
  onClick: () => void;
}

interface NotifBodyProps {
  kind: NotifKind;
  session: Session;
  /** When true, renders as a standalone card (notif mode) rather than embedded in row */
  standalone?: boolean;
  /** Submit a response via IPC (approve/deny/send answer) */
  onSubmit?: (response: string) => void;
  /** Jump to terminal for this session */
  onJump?: () => void;
  "data-testid"?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const NotifBody = memo(function NotifBody({
  kind,
  session,
  standalone = false,
  onSubmit,
  onJump,
  "data-testid": testId,
}: NotifBodyProps) {
  switch (kind) {
    case "two":
      return (
        <NotifTwo
          session={session}
          standalone={standalone}
          onSubmit={onSubmit}
          testId={testId}
        />
      );
    case "three":
      return (
        <NotifThree
          session={session}
          standalone={standalone}
          onSubmit={onSubmit}
          testId={testId}
        />
      );
    case "jump":
      return (
        <NotifJump
          session={session}
          standalone={standalone}
          onSubmit={onSubmit}
          onJump={onJump}
          testId={testId}
        />
      );
    case "done":
      return (
        <NotifDone
          session={session}
          standalone={standalone}
          onJump={onJump}
          testId={testId}
        />
      );
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Extract tool display info from currentTool or toolName */
function getToolDisplay(session: Session): { name: string; args: string } {
  if (session.currentTool) {
    const name = session.currentTool.name;
    const inputStr = Object.keys(session.currentTool.input).length > 0
      ? formatToolArgs(session.currentTool.input)
      : "";
    return { name, args: inputStr };
  }
  if (session.toolName) {
    return { name: session.toolName, args: "" };
  }
  return { name: "unknown", args: "" };
}

/** Format tool input as a compact display string */
function formatToolArgs(input: Record<string, unknown>): string {
  const entries = Object.entries(input).slice(0, 3);
  const parts = entries.map(([k, v]) => {
    const val = typeof v === "string"
      ? (v.length > 40 ? v.slice(0, 40) + "..." : v)
      : String(v);
    return `${k}: ${val}`;
  });
  return parts.join(", ");
}

// ─── Kind: two (2-way permission) ──────────────────────────────────────────

interface NotifTwoProps {
  session: Session;
  standalone: boolean;
  onSubmit?: (response: string) => void;
  testId?: string;
}

function NotifTwo({ session, standalone, onSubmit, testId }: NotifTwoProps) {
  const { name, args } = getToolDisplay(session);

  const handleApprove = useCallback(() => {
    onSubmit?.("approve");
  }, [onSubmit]);

  const handleDeny = useCallback(() => {
    onSubmit?.("deny");
  }, [onSubmit]);

  // Keyboard: Enter = primary, Escape = dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApprove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDeny();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleApprove, handleDeny]);

  return (
    <div
      className={`notif-body notif-body--two${standalone ? " notif-body--standalone" : ""}`}
      data-testid={testId || "notif-two"}
    >
      <span className="notif-body__title">Tool permission requested</span>
      <div className="notif-body__code">
        <span className="notif-body__code-tool">{name}</span>
        {args && <span>{`(${args})`}</span>}
      </div>
      <div className="notif-body__actions notif-body__actions--end">
        <button
          className="notif-body__btn notif-body__btn--danger"
          onClick={handleDeny}
          data-testid="notif-deny"
        >
          Deny
        </button>
        <button
          className="notif-body__btn notif-body__btn--primary"
          onClick={handleApprove}
          data-testid="notif-approve"
        >
          Approve
        </button>
      </div>
      <span className="notif-body__hint">
        <kbd>↵</kbd> primary · <kbd>esc</kbd> dismiss
      </span>
    </div>
  );
}

// ─── Kind: three (3-way permission) ────────────────────────────────────────

interface NotifThreeProps {
  session: Session;
  standalone: boolean;
  onSubmit?: (response: string) => void;
  testId?: string;
}

function NotifThree({ session, standalone, onSubmit, testId }: NotifThreeProps) {
  const { name, args } = getToolDisplay(session);

  // Build 3 options from tool data; default set: allow, deny, allow-always
  const options = [
    { label: "Deny", variant: "danger" as const, key: "1" },
    { label: "Allow once", variant: "primary" as const, key: "2" },
    { label: "Allow always", variant: "default" as const, key: "3" },
  ];

  const handleOption = useCallback(
    (index: number) => {
      const labels = ["deny", "approve-once", "approve-always"];
      onSubmit?.(labels[index] ?? "deny");
    },
    [onSubmit]
  );

  // Keyboard: 1/2/3 to pick
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= options.length) {
        e.preventDefault();
        handleOption(idx - 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleOption(0); // deny
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOption, options.length]);

  return (
    <div
      className={`notif-body notif-body--three${standalone ? " notif-body--standalone" : ""}`}
      data-testid={testId || "notif-three"}
    >
      <span className="notif-body__title">Tool permission requested</span>
      <div className="notif-body__code">
        <span className="notif-body__code-tool">{name}</span>
        {args && <span>{`(${args})`}</span>}
      </div>
      <div className="notif-body__actions">
        {options.map((opt, i) => (
          <button
            key={opt.key}
            className={`notif-body__btn notif-body__btn--${opt.variant} notif-body__btn--numbered`}
            onClick={() => handleOption(i)}
            data-testid={`notif-option-${i + 1}`}
          >
            <span className="notif-body__btn-key">{opt.key}</span>
            {opt.label}
          </button>
        ))}
      </div>
      <span className="notif-body__hint">
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick · <kbd>esc</kbd> deny
      </span>
    </div>
  );
}

// ─── Kind: jump (question/answer) ──────────────────────────────────────────

interface NotifJumpProps {
  session: Session;
  standalone: boolean;
  onSubmit?: (response: string) => void;
  onJump?: () => void;
  testId?: string;
}

function NotifJump({ session, standalone, onSubmit, onJump, testId }: NotifJumpProps) {
  // Extract question data from session metadata
  const questionText = session.currentTool?.input?.question as string
    ?? session.toolName
    ?? "Question from agent";

  // Extract structured options (QuestionOption objects) or fall back to plain strings
  const rawOptions = (session.currentTool?.input?.options ?? []) as Array<string | QuestionOption>;
  const options: QuestionOption[] = rawOptions.map((o) =>
    typeof o === "string" ? { label: o } : o
  );

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [freeform, setFreeform] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if (freeform.trim()) {
      onSubmit?.(freeform.trim());
    } else if (selectedOption !== null) {
      onSubmit?.(options[selectedOption]?.label ?? String(selectedOption));
    }
  }, [freeform, selectedOption, options, onSubmit]);

  const handleDismiss = useCallback(() => {
    onSubmit?.("dismiss");
  }, [onSubmit]);

  // Keyboard: 1/2/3 pick, Enter send, Esc dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in input
      if (document.activeElement === inputRef.current) {
        if (e.key === "Escape") {
          e.preventDefault();
          inputRef.current?.blur();
        }
        return;
      }

      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= options.length) {
        e.preventDefault();
        setSelectedOption(idx - 1);
        setFreeform("");
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options.length, handleSend, handleDismiss]);

  return (
    <div
      className={`notif-body notif-body--jump${standalone ? " notif-body--standalone" : ""}`}
      data-testid={testId || "notif-jump"}
    >
      <span className="notif-body__title">Question</span>
      <div className="notif-body__question">{questionText}</div>

      {options.length > 0 && (
        <div className="notif-body__options">
          {options.map((opt, i) => (
            <div
              key={i}
              className={`notif-body__option${selectedOption === i ? " notif-body__option--selected" : ""}`}
              onClick={() => {
                setSelectedOption(i);
                setFreeform("");
              }}
              data-testid={`notif-opt-${i + 1}`}
            >
              <span className="notif-body__option-key">{i + 1}</span>
              <div className="notif-body__option-content">
                <span className="notif-body__option-label">{opt.label}</span>
                {opt.description && (
                  <span className="notif-body__option-desc">{opt.description}</span>
                )}
                {opt.preview && (
                  <pre className="notif-body__option-preview"><code>{stripCodeFences(opt.preview)}</code></pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        className="notif-body__input"
        type="text"
        placeholder="Type your answer..."
        value={freeform}
        onChange={(e) => {
          setFreeform(e.target.value);
          setSelectedOption(null);
        }}
        data-testid="notif-freeform"
      />

      <div className="notif-body__actions notif-body__actions--end">
        <button
          className="notif-body__btn notif-body__btn--default"
          onClick={handleDismiss}
          data-testid="notif-dismiss"
        >
          Dismiss
        </button>
        {onJump && (
          <button
            className="notif-body__btn notif-body__btn--amber"
            onClick={onJump}
            data-testid="notif-jump"
          >
            Jump
          </button>
        )}
        <button
          className="notif-body__btn notif-body__btn--primary"
          onClick={handleSend}
          disabled={!freeform.trim() && selectedOption === null}
          data-testid="notif-send"
        >
          Send
        </button>
      </div>

      <span className="notif-body__hint">
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick · <kbd>↵</kbd> send · <kbd>esc</kbd> dismiss
      </span>
    </div>
  );
}

// ─── Kind: done (task completed) ───────────────────────────────────────────

interface NotifDoneProps {
  session: Session;
  standalone: boolean;
  onJump?: () => void;
  testId?: string;
}

function NotifDone({ session, standalone, onJump, testId }: NotifDoneProps) {
  const [quickReply, setQuickReply] = useState("");

  // Summary comes from lastError (error message) or toolName
  const summary = session.lastError
    ? session.lastError
    : session.currentTool?.name
      ? `Last: ${session.currentTool.name}`
      : "Task completed";

  const projectName = session.cwd
    ? session.cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? ""
    : "";

  return (
    <div
      className={`notif-body notif-body--done${standalone ? " notif-body--standalone" : ""}`}
      data-testid={testId || "notif-done"}
    >
      <span className="notif-body__title">
        {projectName ? `Completed · ${projectName}` : "Completed"}
      </span>
      <div className="notif-body__reply">{summary}</div>
      <input
        className="notif-body__input"
        type="text"
        placeholder="Quick reply..."
        value={quickReply}
        onChange={(e) => setQuickReply(e.target.value)}
        data-testid="notif-quick-reply"
      />
      {standalone && onJump && (
        <div className="notif-body__actions notif-body__actions--end">
          <button
            className="notif-body__btn notif-body__btn--primary"
            onClick={onJump}
            data-testid="notif-jump-back"
          >
            Jump back
          </button>
        </div>
      )}
    </div>
  );
}
