import { useState, useMemo, memo } from "react";
import { GroupedRows } from "./GroupedRows";
import type { GroupBy, SortBy } from "./GroupedRows";
import type { Session } from "../store/sessions";
import "./SessionList.css";

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  viewingSessionId: string | null;
  onSessionClick: (session: Session) => void;
  onRenameSession: (id: string, label: string) => void;
  onDeleteSession: (id: string) => void;
  onSetSessionTag: (id: string, tag?: string) => void;
  onCreateGroup: (name: string) => void;
  groups: string[];
  "data-testid"?: string;
}

const GROUP_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: "Flat", value: "none" },
  { label: "State", value: "state" },
  { label: "Agent", value: "agent" },
  { label: "Project", value: "project" },
];

const SORT_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Attention", value: "attention" },
  { label: "Updated", value: "updated" },
];

export const SessionList = memo(function SessionList({
  sessions,
  onSessionClick,
  "data-testid": testId,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("state");
  const [sortBy, setSortBy] = useState<SortBy>("attention");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) =>
      s.label.toLowerCase().includes(q) ||
      (s.title && s.title.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  return (
    <div className="session-list" data-testid={testId || "session-list"}>
      <div className="session-list__toolbar">
        <div className="session-list__search">
          <input
            type="text"
            className="session-list__search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="session-search"
          />
          {searchQuery && (
            <button
              className="session-list__search-clear"
              onClick={() => setSearchQuery("")}
              data-testid="search-clear"
            >
              ×
            </button>
          )}
        </div>
        <select
          className="session-list__picker"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          data-testid="group-by-picker"
        >
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="session-list__picker"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          data-testid="sort-by-picker"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && sessions.length === 0 && (
        <div className="session-list__empty" data-testid="sessions-empty">
          Waiting for agent sessions...
        </div>
      )}
      {filtered.length === 0 && sessions.length > 0 && (
        <div className="session-list__empty" data-testid="sessions-empty">
          No matching sessions
        </div>
      )}

      {filtered.length > 0 && (
        <GroupedRows
          sessions={filtered}
          groupBy={groupBy}
          sortBy={sortBy}
          onJump={onSessionClick}
        />
      )}
    </div>
  );
});
