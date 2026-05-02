import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffViewer } from "./DiffViewer";
import type { ApprovalRequest } from "../store/sessions";
import "./ApprovalPanel.css";

interface ApprovalPanelProps {
  request: ApprovalRequest | null;
  onApprovalHandled: () => void;
}

type ApprovalStatus = "pending" | "approving" | "rejecting" | "approved" | "rejected";

export function ApprovalPanel({ request, onApprovalHandled }: ApprovalPanelProps) {
  const [status, setStatus] = useState<ApprovalStatus>("pending");

  const handleApprove = useCallback(async () => {
    if (!request || status !== "pending") return;

    console.log("[ApprovalPanel] Approving request:", request.toolUseId);
    setStatus("approving");
    try {
      const result = await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: true,
      });
      console.log("[ApprovalPanel] Approval result:", result);
      // Clear immediately after successful approval
      onApprovalHandled();
    } catch (error) {
      console.error("[ApprovalPanel] Failed to submit approval:", error);
      // Clear the approval request even on error (likely timed out)
      onApprovalHandled();
    }
  }, [request, status, onApprovalHandled]);

  const handleReject = useCallback(async () => {
    if (!request || status !== "pending") return;

    console.log("[ApprovalPanel] Rejecting request:", request.toolUseId);
    setStatus("rejecting");
    try {
      await invoke("submit_approval_response", {
        toolUseId: request.toolUseId,
        approved: false,
      });
      // Clear immediately after successful rejection
      onApprovalHandled();
    } catch (error) {
      console.error("[ApprovalPanel] Failed to submit rejection:", error);
      // Clear the approval request even on error
      onApprovalHandled();
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