import { useMemo } from "react";
import * as Diff from "diff";
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
  const changes = Diff.diffLines(oldContent, newContent);
  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let lineCount = 0;

  for (const change of changes) {
    const lines = change.value.endsWith("\n")
      ? change.value.slice(0, -1).split("\n")
      : change.value.split("\n");

    if (change.added) {
      for (const content of lines) {
        if (lineCount >= maxLines) break;
        result.push({ type: "add", content, newLineNumber: newLine++ });
        lineCount++;
      }
    } else if (change.removed) {
      for (const content of lines) {
        if (lineCount >= maxLines) break;
        result.push({ type: "remove", content, oldLineNumber: oldLine++ });
        lineCount++;
      }
    } else {
      for (const content of lines) {
        if (lineCount >= maxLines) break;
        result.push({ type: "context", content, oldLineNumber: oldLine++, newLineNumber: newLine++ });
        lineCount++;
      }
    }

    if (lineCount >= maxLines) break;
  }

  if (lineCount >= maxLines) {
    result.push({
      type: "context",
      content: `... (more lines)`,
    });
  }

  return result;
}
