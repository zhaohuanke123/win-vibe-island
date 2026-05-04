import { useState } from "react";
import type { ToolExecution } from "../store/sessions";
import { CommandAnalysis } from "./CommandAnalysis";
import { extractBashCommand } from "../utils/command";
import "./ToolExecutionDetail.css";

interface ToolExecutionDetailProps {
  execution: ToolExecution;
  "data-testid"?: string;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function truncateString(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

export function ToolExecutionDetail({ execution, "data-testid": testId }: ToolExecutionDetailProps) {
  const [expanded, setExpanded] = useState(false);

  const hasInput = Object.keys(execution.input).length > 0;
  const hasOutput = execution.output || execution.outputSummary;
  const hasError = !!execution.error;

  const inputJson = hasInput ? JSON.stringify(execution.input, null, 2) : "";
  const outputText = execution.output || execution.outputSummary || "";
  const bashCommand = execution.toolName === "Bash" ? extractBashCommand(execution.input) : null;

  return (
    <div
      className={`tool-exec-detail tool-exec-detail--${execution.status}`}
      data-testid={testId || "tool-exec-detail"}
    >
      <div
        className="tool-exec-detail__header"
        onClick={() => setExpanded(!expanded)}
        data-testid="tool-exec-toggle"
      >
        <span className={`tool-exec-detail__arrow${expanded ? " tool-exec-detail__arrow--expanded" : ""}`}>
          ▸
        </span>
        <span className="tool-exec-detail__tool">{execution.toolName}</span>
        <span className="tool-exec-detail__status" data-status={execution.status}>
          {execution.status}
        </span>
        {execution.duration !== undefined && (
          <span className="tool-exec-detail__duration">{formatDuration(execution.duration)}</span>
        )}
      </div>

      {expanded && (
        <div className="tool-exec-detail__body">
          {hasInput && (
            <div className="tool-exec-detail__section">
              <div className="tool-exec-detail__label">Input</div>
              <pre className="tool-exec-detail__code">{inputJson}</pre>
            </div>
          )}

          {hasOutput && (
            <div className="tool-exec-detail__section">
              <div className="tool-exec-detail__label">Output</div>
              <pre className="tool-exec-detail__code">{truncateString(outputText, 2000)}</pre>
            </div>
          )}

          {hasError && (
            <div className="tool-exec-detail__section">
              <div className="tool-exec-detail__label">Error</div>
              <div className="tool-exec-detail__error-block">{execution.error}</div>
            </div>
          )}

          {bashCommand && (
            <div className="tool-exec-detail__section">
              <div className="tool-exec-detail__label">Command Analysis</div>
              <CommandAnalysis command={bashCommand} />
            </div>
          )}

          <div className="tool-exec-detail__meta">
            <span>ID: {execution.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}
