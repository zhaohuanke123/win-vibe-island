import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./ApprovalPanel.css";

export interface ApprovalRequest {
  sessionId: string;
  sessionLabel: string;
  action: string;
  riskLevel: "low" | "medium" | "high";
  timestamp: number;
}

interface ApprovalPanelProps {
  request: ApprovalRequest | null;
  onApprovalHandled: () => void;
}

type ApprovalStatus = "pending" | "approving" | "rejecting" | "approved" | "rejected";

export function ApprovalPanel({ request, onApprovalHandled }: ApprovalPanelProps) {
  const [status, setStatus] = useState<ApprovalStatus>("pending");

  const handleApprove = useCallback(async () => {
    if (!request || status !== "pending") return;

    setStatus("approving");
    try {
      await invoke("submit_approval_response", {
        sessionId: request.sessionId,
        approved: true,
      });
      setStatus("approved");
      // Brief delay to show the approved state before closing
      setTimeout(() => {
        onApprovalHandled();
      }, 500);
    } catch (error) {
      console.error("Failed to submit approval:", error);
      setStatus("pending");
    }
  }, [request, status, onApprovalHandled]);

  const handleReject = useCallback(async () => {
    if (!request || status !== "pending") return;

    setStatus("rejecting");
    try {
      await invoke("submit_approval_response", {
        sessionId: request.sessionId,
        approved: false,
      });
      setStatus("rejected");
      // Brief delay to show the rejected state before closing
      setTimeout(() => {
        onApprovalHandled();
      }, 500);
    } catch (error) {
      console.error("Failed to submit rejection:", error);
      setStatus("pending");
    }
  }, [request, status, onApprovalHandled]);

  // Keyboard shortcuts: Enter to approve, Escape to reject
  useEffect(() => {
    if (!request || status !== "pending") return;

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

  if (!request) {
    return null;
  }

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
    <div className={`approval-panel ${isComplete ? `approval-panel--${status}` : ""}`}>
      <div className="approval-panel__header">
        <span className="approval-panel__icon">!</span>
        <span className="approval-panel__title">Approval Required</span>
      </div>

      <div className="approval-panel__session">
        <span className="approval-panel__label">{request.sessionLabel}</span>
      </div>

      <div className="approval-panel__action">
        {request.action}
      </div>

      <div className="approval-panel__footer">
        <span className={`approval-panel__risk ${getRiskLevelClass()}`}>
          {request.riskLevel.toUpperCase()} RISK
        </span>

        <div className="approval-panel__buttons">
          <button
            className="approval-panel__btn approval-panel__btn--reject"
            onClick={handleReject}
            disabled={isLoading || isComplete}
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
            onClick={handleApprove}
            disabled={isLoading || isComplete}
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

      <div className="approval-panel__shortcuts">
        <span>Enter</span> to approve, <span>Esc</span> to reject
      </div>
    </div>
  );
}