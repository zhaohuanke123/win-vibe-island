import { useMemo, useState } from "react";
import { useSessionsStore } from "../store/sessions";
import { useTimelineStore, getTimeRangeMs, getTimeRangeOptions } from "../store/timeline";
import { ToolExecutionDetail } from "./ToolExecutionDetail";
import type { ToolExecution } from "../store/sessions";
import "./ActivityTimeline.css";

interface TimelineEntry {
  execution: ToolExecution;
  sessionLabel: string;
  sessionId: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function exportAsJson(entries: TimelineEntry[]): string {
  const data = entries.map((e) => ({
    time: new Date(e.execution.timestamp).toISOString(),
    session: e.sessionLabel,
    tool: e.execution.toolName,
    status: e.execution.status,
    duration: e.execution.duration,
    input: e.execution.input,
    output: e.execution.output,
    error: e.execution.error,
  }));
  return JSON.stringify(data, null, 2);
}

function exportAsMarkdown(entries: TimelineEntry[]): string {
  const lines = [
    "# Activity Timeline",
    "",
    `Exported at ${new Date().toISOString()}`,
    "",
    "| Time | Session | Tool | Status | Duration |",
    "|------|---------|------|--------|----------|",
  ];

  for (const e of entries) {
    const time = formatTime(e.execution.timestamp);
    const dur = e.execution.duration ? `${e.execution.duration}ms` : "-";
    lines.push(`| ${time} | ${e.sessionLabel} | ${e.execution.toolName} | ${e.execution.status} | ${dur} |`);
  }

  return lines.join("\n");
}

export function ActivityTimeline({ "data-testid": testId }: { "data-testid"?: string }) {
  const sessions = useSessionsStore((s) => s.sessions);
  const { timeRange, setTimeRange } = useTimelineStore();
  const [exportFormat, setExportFormat] = useState<"json" | "md">("json");
  const [exportReady, setExportReady] = useState(false);

  const entries = useMemo<TimelineEntry[]>(() => {
    const all: TimelineEntry[] = [];
    for (const session of sessions) {
      for (const exec of session.toolHistory) {
        all.push({
          execution: exec,
          sessionLabel: session.label,
          sessionId: session.id,
        });
      }
    }

    // Sort by timestamp descending (newest first)
    all.sort((a, b) => b.execution.timestamp - a.execution.timestamp);

    const rangeMs = getTimeRangeMs(timeRange);
    if (rangeMs > 0) {
      const cutoff = Date.now() - rangeMs;
      return all.filter((e) => e.execution.timestamp >= cutoff);
    }
    return all;
  }, [sessions, timeRange]);

  const handleExport = () => {
    const data = exportFormat === "json" ? exportAsJson(entries) : exportAsMarkdown(entries);
    const ext = exportFormat === "json" ? "json" : "md";
    const mimeType = exportFormat === "json" ? "application/json" : "text/markdown";

    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibe-island-activity-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportReady(false);
  };

  return (
    <div className="activity-timeline" data-testid={testId || "activity-timeline"}>
      <div className="activity-timeline__toolbar">
        <select
          className="activity-timeline__range-select"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
          data-testid="time-range-select"
        >
          {getTimeRangeOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <span className="activity-timeline__count">{entries.length} entries</span>

        <div className="activity-timeline__export-group">
          <select
            className="activity-timeline__export-format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "json" | "md")}
          >
            <option value="json">JSON</option>
            <option value="md">Markdown</option>
          </select>
          <button
            className="activity-timeline__export-btn"
            onClick={() => setExportReady(true)}
            disabled={entries.length === 0}
            data-testid="export-btn"
          >
            Export
          </button>
        </div>
      </div>

      {exportReady && (
        <div className="activity-timeline__export-confirm">
          <span>Export {entries.length} entries as {exportFormat.toUpperCase()}?</span>
          <div className="activity-timeline__export-actions">
            <button className="activity-timeline__btn activity-timeline__btn--confirm" onClick={handleExport}>
              Download
            </button>
            <button className="activity-timeline__btn activity-timeline__btn--cancel" onClick={() => setExportReady(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {entries.length > 0 ? (
        <div className="activity-timeline__list">
          {entries.map((entry) => (
            <div key={entry.execution.id} className="activity-timeline__entry">
              <div className="activity-timeline__entry-meta">
                <span className="activity-timeline__entry-time">{formatTime(entry.execution.timestamp)}</span>
                <span className="activity-timeline__entry-session" title={entry.sessionLabel}>
                  {entry.sessionLabel}
                </span>
              </div>
              <ToolExecutionDetail execution={entry.execution} />
            </div>
          ))}
        </div>
      ) : (
        <div className="activity-timeline__empty">No tool activity in the selected time range</div>
      )}
    </div>
  );
}
