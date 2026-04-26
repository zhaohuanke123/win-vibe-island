import { useMemo } from "react";
import "./DiffViewer.css";

export interface DiffData {
  fileName: string;
  oldContent: string;
  newContent: string;
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  fileName?: string;
  maxLines?: number;
}

export function DiffViewer({
  oldContent,
  newContent,
  fileName,
  maxLines = 100,
}: DiffViewerProps) {
  const diffLines = useMemo(() => {
    return computeDiff(oldContent, newContent, maxLines);
  }, [oldContent, newContent, maxLines]);

  if (diffLines.length === 0) {
    return null;
  }

  return (
    <div className="diff-viewer">
      {fileName && (
        <div className="diff-viewer__header">
          <span className="diff-viewer__file-icon">📄</span>
          <span className="diff-viewer__file-name">{fileName}</span>
        </div>
      )}
      <div className="diff-viewer__content">
        {diffLines.map((line, index) => (
          <div
            key={index}
            className={`diff-viewer__line diff-viewer__line--${line.type}`}
          >
            <span className="diff-viewer__line-num">
              {line.type === "remove" && line.oldLineNumber}
              {line.type === "add" && line.newLineNumber}
              {line.type === "context" && line.oldLineNumber}
            </span>
            <span className="diff-viewer__line-num diff-viewer__line-num--new">
              {line.type === "context" && line.newLineNumber}
            </span>
            <span className="diff-viewer__line-prefix">
              {line.type === "add" && "+"}
              {line.type === "remove" && "-"}
              {line.type === "context" && " "}
            </span>
            <span className="diff-viewer__line-content">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function computeDiff(
  oldContent: string,
  newContent: string,
  maxLines: number
): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const result: DiffLine[] = [];

  // Simple line-by-line diff algorithm
  // For production, consider using a proper diff library like 'diff' or 'fast-diff'
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let oldIdx = 0;
  let newIdx = 0;
  let lineCount = 0;

  while ((oldIdx < oldLines.length || newIdx < newLines.length) && lineCount < maxLines) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];

    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      if (oldLine === newLine) {
        // Context line (unchanged)
        result.push({
          type: "context",
          content: oldLine,
          oldLineNumber: oldIdx + 1,
          newLineNumber: newIdx + 1,
        });
        oldIdx++;
        newIdx++;
      } else if (!newSet.has(oldLine)) {
        // Line removed
        result.push({
          type: "remove",
          content: oldLine,
          oldLineNumber: oldIdx + 1,
        });
        oldIdx++;
      } else if (!oldSet.has(newLine)) {
        // Line added
        result.push({
          type: "add",
          content: newLine,
          newLineNumber: newIdx + 1,
        });
        newIdx++;
      } else {
        // Both modified - show as remove then add
        result.push({
          type: "remove",
          content: oldLine,
          oldLineNumber: oldIdx + 1,
        });
        result.push({
          type: "add",
          content: newLine,
          newLineNumber: newIdx + 1,
        });
        oldIdx++;
        newIdx++;
      }
    } else if (oldIdx < oldLines.length) {
      // Remaining old lines are removals
      result.push({
        type: "remove",
        content: oldLine,
        oldLineNumber: oldIdx + 1,
      });
      oldIdx++;
    } else {
      // Remaining new lines are additions
      result.push({
        type: "add",
        content: newLine,
        newLineNumber: newIdx + 1,
      });
      newIdx++;
    }
    lineCount++;
  }

  if (lineCount >= maxLines) {
    result.push({
      type: "context",
      content: `... (${oldLines.length + newLines.length - lineCount} more lines)`,
    });
  }

  return result;
}
