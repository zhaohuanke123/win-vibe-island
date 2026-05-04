import { useState, useEffect, useCallback, type WheelEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffViewer } from "./DiffViewer";
import type { ApprovalRequest, Question, QuestionOption } from "../store/sessions";
import { APPROVAL_TYPES } from "../store/sessions";
import { useApprovalTimeout } from "../hooks/useApprovalTimeout";
import { marked } from "marked";
import "./ApprovalPanel.css";

interface ApprovalPanelProps {
  request: ApprovalRequest | null;
  onApprovalHandled: () => void;
  measurement?: boolean;
}

type ApprovalStatus = "pending" | "approving" | "rejecting" | "approved" | "rejected";

function handlePanelWheel(event: WheelEvent<HTMLDivElement>) {
  const scrollBody = event.currentTarget.querySelector<HTMLElement>(".approval-panel__body");
  if (!scrollBody || scrollBody.scrollHeight <= scrollBody.clientHeight) return;

  const previousScrollTop = scrollBody.scrollTop;
  scrollBody.scrollTop += event.deltaY;

  if (scrollBody.scrollTop !== previousScrollTop) {
    event.preventDefault();
    event.stopPropagation();
  }
}

// Plan step parsed from description
interface PlanStep {
  number: number;
  title: string;
}

// Parse plan steps from description text
// Format: "1. Step title\n2. Another step"

function TimeoutIndicator({ timeout }: { timeout: ReturnType<typeof useApprovalTimeout> }) {
  const { remainingSeconds, isUrgent, isExpired, progressPercent } = timeout;

  if (isExpired) {
    return (
      <div className="approval-panel__timeout">
        <span className="approval-panel__timeout-text approval-panel__timeout-text--expired">Timed out</span>
      </div>
    );
  }

  const level = remainingSeconds > 20 ? "safe" : isUrgent ? "urgent" : "warning";

  return (
    <div className="approval-panel__timeout">
      <div className="approval-panel__timeout-bar">
        <div
          className={`approval-panel__timeout-bar-fill approval-panel__timeout-bar-fill--${level}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <span className={`approval-panel__timeout-text approval-panel__timeout-text--${level}`}>
        {remainingSeconds}s
      </span>
    </div>
  );
}
function parsePlanSteps(description: string): PlanStep[] {
  if (!description) return [];
  const lines = description.split('\n');
  return lines
    .map(line => {
      const match = line.match(/^(\d+)\.\s+(.+)$/);
      if (match) {
        return { number: parseInt(match[1]), title: match[2] };
      }
      return null;
    })
    .filter((step): step is PlanStep => step !== null);
}

// Question Panel for AskUserQuestion tool
function QuestionPanel({ request, onHandled, measurement = false }: { request: ApprovalRequest; onHandled: () => void; measurement?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"pending" | "submitting" | "done">("pending");
  const timeout = useApprovalTimeout(request);

  const handleOptionSelect = (questionText: string, optionLabel: string, isCustom?: boolean) => {
    if (isCustom) {
      setAnswers(prev => ({
        ...prev,
        [questionText]: customInputs[questionText] || "",
      }));
    } else {
      setAnswers(prev => ({
        ...prev,
        [questionText]: optionLabel,
      }));
    }
  };

  const handleCustomInputChange = (questionText: string, value: string) => {
    setCustomInputs(prev => ({
      ...prev,
      [questionText]: value,
    }));
    // Also update the answer if user is typing custom input
    setAnswers(prev => ({
      ...prev,
      [questionText]: value,
    }));
  };

  const handleSubmit = async () => {
    // Check if all questions have answers
    const allAnswered = request.questions?.every(q => answers[q.question]?.trim());
    if (!allAnswered) {
      console.warn("[QuestionPanel] Not all questions answered");
      return;
    }

    setStatus("submitting");
    try {
      await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: true,
        answers: answers,
      });
      onHandled();
    } catch (error) {
      console.error("[QuestionPanel] Failed to submit answers:", error);
      onHandled();
    }
  };

  const handleSkip = async () => {
    setStatus("submitting");
    try {
      await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: false,
        answers: null,
      });
      onHandled();
    } catch (error) {
      console.error("[QuestionPanel] Failed to skip:", error);
      onHandled();
    }
  };

  if (!request.questions || request.questions.length === 0) {
    return null;
  }

  const allAnswered = request.questions.every(q => answers[q.question]?.trim());

  // Check if this is a Plan mode question
  const isPlanMode = request.questions.some(q =>
    q.header === "Plan" || q.header === "PLAN" || q.header === "plan"
  );

  // Derive footer actions from the first question that contains options
  const footerQuestion = isPlanMode
    ? request.questions.find(q => q.options && q.options.length > 0) ?? null
    : null;

  // Render Plan mode with special UI
  if (isPlanMode) {
    return (
      <div className="approval-panel approval-panel--plan" data-testid="approval-panel" onWheelCapture={handlePanelWheel}>
        <div className="approval-panel__header">
          <span className="approval-panel__icon">📋</span>
          <span className="approval-panel__title">Plan</span>
        </div>

        <div className="approval-panel__body">
          <div className="approval-panel__session">
            <span className="approval-panel__label">{request.sessionLabel}</span>
          </div>

          {request.questions.map((q: Question, qIndex: number) => {
            const planOption = q.options.find(opt =>
              opt.label.toLowerCase().includes("approve") ||
              opt.label.toLowerCase().includes("proceed")
            );
            const steps = planOption ? parsePlanSteps(planOption.description || "") : [];

            return (
              <div key={qIndex} className="approval-panel__question-block">
                <div className="approval-panel__question-header">
                  <span className="approval-panel__question-text">{q.question}</span>
                </div>

                {steps.length > 0 && (
                  <div className="approval-panel__plan-steps">
                    {steps.map((step, stepIndex) => (
                      <div key={stepIndex} className="approval-panel__plan-step">
                        <span className="approval-panel__plan-step-number">{step.number}</span>
                        <span className="approval-panel__plan-step-content">{step.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {footerQuestion && (
          <div className="approval-panel__footer">
            <TimeoutIndicator timeout={timeout} />
            <div className="approval-panel__buttons">
              {footerQuestion.options.map((opt: QuestionOption, optIndex: number) => {
                let btnClass = "approval-panel__btn approval-panel__btn--skip";
                if (opt.label.toLowerCase().includes("approve") || opt.label.toLowerCase().includes("proceed")) {
                  btnClass = "approval-panel__btn approval-panel__btn--proceed";
                } else if (opt.label.toLowerCase().includes("modify")) {
                  btnClass = "approval-panel__btn approval-panel__btn--modify";
                }

                return (
                  <button
                    key={optIndex}
                    className={btnClass}
                    onClick={() => {
                      if (measurement) return;
                      setAnswers({ [footerQuestion.question]: opt.label });
                      invoke("submit_approval_response", {
                        toolUseId: request.toolUseId,
                        approved: opt.label.toLowerCase().includes("approve") ||
                                  opt.label.toLowerCase().includes("proceed"),
                        answers: { [footerQuestion.question]: opt.label },
                      }).then(() => onHandled()).catch((error) => {
                        console.error("[PlanPanel] Failed to submit:", error);
                        onHandled();
                      });
                    }}
                    disabled={measurement || status !== "pending" || timeout.isExpired}
                  >
                    {status === "submitting" ? (
                      <span className="approval-panel__spinner" />
                    ) : (
                      opt.label
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Regular question mode
  return (
    <div className="approval-panel approval-panel--question" data-testid="approval-panel" onWheelCapture={handlePanelWheel}>
      <div className="approval-panel__header">
        <span className="approval-panel__icon">?</span>
        <span className="approval-panel__title">Question</span>
      </div>

      <div className="approval-panel__body">
        <div className="approval-panel__session">
          <span className="approval-panel__label">{request.sessionLabel}</span>
        </div>

        <div className="approval-panel__questions">
          {request.questions.map((q: Question, qIndex: number) => (
            <div key={qIndex} className="approval-panel__question-block">
              <div className="approval-panel__question-header">
                <span className="approval-panel__question-tag">{q.header}</span>
                <span className="approval-panel__question-text">{q.question}</span>
              </div>

              <div className="approval-panel__options">
                {q.options.map((opt: QuestionOption, optIndex: number) => (
                  <button
                    key={optIndex}
                    className={`approval-panel__option ${
                      answers[q.question] === opt.label ? "approval-panel__option--selected" : ""
                    }`}
                    onClick={() => {
                      if (!measurement) handleOptionSelect(q.question, opt.label);
                    }}
                    disabled={measurement || status !== "pending"}
                  >
                    <span className="approval-panel__option-label">{opt.label}</span>
                    {opt.description && (
                      <span className="approval-panel__option-desc">{opt.description}</span>
                    )}
                  </button>
                ))}

                {/* Custom input option */}
                <div className="approval-panel__custom-input">
                  <input
                    type="text"
                    placeholder="Or type your own answer..."
                    value={customInputs[q.question] || ""}
                    onChange={(e) => handleCustomInputChange(q.question, e.target.value)}
                    disabled={measurement || status !== "pending"}
                    className="approval-panel__text-input"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="approval-panel__footer">
        <TimeoutIndicator timeout={timeout} />
        <div className="approval-panel__buttons">
          <button
            className="approval-panel__btn approval-panel__btn--skip"
            onClick={handleSkip}
            disabled={measurement || status !== "pending" || timeout.isExpired}
          >
            {status === "submitting" ? (
              <span className="approval-panel__spinner" />
            ) : (
              "Skip"
            )}
          </button>
          <button
            className="approval-panel__btn approval-panel__btn--submit"
            onClick={handleSubmit}
            disabled={measurement || status !== "pending" || !allAnswered || timeout.isExpired}
          >
            {status === "submitting" ? (
              <span className="approval-panel__spinner" />
            ) : (
              "Submit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Permission Panel for regular tool approvals
function PermissionPanel({ request, onHandled, measurement = false }: { request: ApprovalRequest; onHandled: () => void; measurement?: boolean }) {
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const timeout = useApprovalTimeout(request);

  const handleApprove = useCallback(async () => {
    if (!request || status !== "pending") return;

    console.log("[PermissionPanel] Approving request:", request.toolUseId);
    setStatus("approving");
    try {
      const result = await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: true,
        answers: null,
      });
      console.log("[PermissionPanel] Approval result:", result);
      onHandled();
    } catch (error) {
      console.error("[PermissionPanel] Failed to submit approval:", error);
      onHandled();
    }
  }, [request, status, onHandled]);

  const handleReject = useCallback(async () => {
    if (!request || status !== "pending") return;

    console.log("[PermissionPanel] Rejecting request:", request.toolUseId);
    setStatus("rejecting");
    try {
      await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: false,
        answers: null,
      });
      onHandled();
    } catch (error) {
      console.error("[PermissionPanel] Failed to submit rejection:", error);
      onHandled();
    }
  }, [request, status, onHandled]);

  // Keyboard shortcuts: Enter to approve, Escape to reject
  useEffect(() => {
    if (measurement || !request || status !== "pending") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApprove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleReject();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request, status, handleApprove, handleReject]);

  const getRiskLevelClass = () => {
    switch (request.riskLevel) {
      case "low":
        return "approval-panel__risk--low";
      case "medium":
        return "approval-panel__risk--medium";
      case "high":
        return "approval-panel__risk--high";
      default:
        return "";
    }
  };

  const isLoading = status === "approving" || status === "rejecting";
  const isComplete = status === "approved" || status === "rejected";

  return (
    <div className={`approval-panel ${isComplete ? `approval-panel--${status}` : ""}`} data-testid="approval-panel" onWheelCapture={handlePanelWheel}>
      <div className="approval-panel__header">
        <span className="approval-panel__icon">!</span>
        <span className="approval-panel__title">Approval Required</span>
      </div>

      <div className="approval-panel__body">
        <div className="approval-panel__session">
          <span className="approval-panel__label">{request.sessionLabel}</span>
          {request.toolName && (
            <span className="approval-panel__tool-name">[{request.toolName}]</span>
          )}
        </div>

        <div className="approval-panel__action">
          {request.action}
        </div>

        {request.diff && (
          <DiffViewer
            oldContent={request.diff.oldContent}
            newContent={request.diff.newContent}
            fileName={request.diff.fileName}
          />
        )}
      </div>

      <div className="approval-panel__footer">
        <span className={`approval-panel__risk ${getRiskLevelClass()}`} data-testid="risk-level">
          {request.riskLevel?.toUpperCase() || "MEDIUM"} RISK
        </span>
        <TimeoutIndicator timeout={timeout} />
        <div className="approval-panel__buttons">
          <button
            className="approval-panel__btn approval-panel__btn--reject"
            data-testid="reject-btn"
            onClick={measurement ? undefined : handleReject}
            disabled={measurement || isLoading || isComplete || timeout.isExpired}
          >
            {status === "rejecting" ? (
              <span className="approval-panel__spinner" />
            ) : (
              "Reject"
            )}
            {status === "rejected" && " - Done"}
          </button>
          <button
            className="approval-panel__btn approval-panel__btn--approve"
            data-testid="approve-btn"
            onClick={measurement ? undefined : handleApprove}
            disabled={measurement || isLoading || isComplete || timeout.isExpired}
          >
            {status === "approving" ? (
              <span className="approval-panel__spinner" />
            ) : (
              "Approve"
            )}
            {status === "approved" && " - Done"}
          </button>
        </div>
      </div>

      {!timeout.isExpired && (
        <div className="approval-panel__shortcuts">
          <span>Enter</span> to approve, <span>Esc</span> to reject
        </div>
      )}
    </div>
  );
}

export function ApprovalPanel({ request, onApprovalHandled, measurement = false }: ApprovalPanelProps) {
  if (!request) {
    return null;
  }

  // Route to different panels based on approval type
  switch (request.approvalType) {
    case APPROVAL_TYPES.PLAN:
      return <PlanPanel request={request} onHandled={onApprovalHandled} measurement={measurement} />;
    case APPROVAL_TYPES.QUESTION:
      return <QuestionPanel request={request} onHandled={onApprovalHandled} measurement={measurement} />;
    case APPROVAL_TYPES.PERMISSION:
    default:
      return <PermissionPanel request={request} onHandled={onApprovalHandled} measurement={measurement} />;
  }
}

// Plan Panel for ExitPlanMode tool - displays the actual plan content
function PlanPanel({ request, onHandled, measurement = false }: { request: ApprovalRequest; onHandled: () => void; measurement?: boolean }) {
  const [status, setStatus] = useState<"pending" | "submitting" | "done">("pending");
  const timeout = useApprovalTimeout(request);

  const handleProceed = async () => {
    setStatus("submitting");
    try {
      await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: true,
        answers: null,
      });
      onHandled();
    } catch (error) {
      console.error("[PlanPanel] Failed to proceed:", error);
      onHandled();
    }
  };

  const handleCancel = async () => {
    setStatus("submitting");
    try {
      await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: false,
        answers: null,
      });
      onHandled();
    } catch (error) {
      console.error("[PlanPanel] Failed to cancel:", error);
      onHandled();
    }
  };

  // Render plan content as markdown
  const renderPlanContent = () => {
    if (!request.planContent) {
      return <div className="approval-panel__action">No plan content provided</div>;
    }

    // Parse markdown and render as HTML
    const htmlContent = marked.parse(request.planContent, { breaks: true, gfm: true });
    return (
      <div
        className="approval-panel__plan-content"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    );
  };

  return (
    <div className="approval-panel approval-panel--plan" data-testid="approval-panel" onWheelCapture={handlePanelWheel}>
      <div className="approval-panel__header">
        <span className="approval-panel__icon">📋</span>
        <span className="approval-panel__title">Plan</span>
      </div>

      <div className="approval-panel__body">
        <div className="approval-panel__session">
          <span className="approval-panel__label">{request.sessionLabel}</span>
        </div>

        {renderPlanContent()}
      </div>

      <div className="approval-panel__footer">
        <TimeoutIndicator timeout={timeout} />
        <div className="approval-panel__buttons">
          <button
            className="approval-panel__btn approval-panel__btn--skip"
            onClick={measurement ? undefined : handleCancel}
            disabled={measurement || status !== "pending" || timeout.isExpired}
          >
            {status === "submitting" ? (
              <span className="approval-panel__spinner" />
            ) : (
              "Cancel"
            )}
          </button>
          <button
            className="approval-panel__btn approval-panel__btn--proceed"
            onClick={measurement ? undefined : handleProceed}
            disabled={measurement || status !== "pending" || timeout.isExpired}
          >
            {status === "submitting" ? (
              <span className="approval-panel__spinner" />
            ) : (
              "Proceed"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
