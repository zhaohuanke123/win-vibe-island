import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StatusDot } from "./StatusDot";
import type { Session, AgentState } from "../store/sessions";
import "./SessionList.css";

interface SessionListProps {
  sessions: Session[];
  activeSessionId: string | null;
  viewingSessionId: string | null;
  onSessionClick: (session: Session) => void;
  "data-testid"?: string;
}

type SortBy = "lastActivity" | "createdAt";
type StateFilter = "all" | AgentState;

interface GroupData {
  cwd: string;
  label: string;
  sessions: Session[];
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function extractProjectName(cwd: string): string {
  if (!cwd) return "Unknown";
  const normalized = cwd.replace(/\\/g, "/").replace(/\/$/, "");
  const last = normalized.split("/").pop() || normalized;
  // Limit to 2 segments from the right for context (e.g. "vibe-island" or "projects/vibe-island")
  const segments = normalized.split("/");
  if (segments.length >= 2) {
    const short = segments.slice(-2).join("/");
    return short.length > 40 ? segments[segments.length - 1] : short;
  }
  return last;
}

const STATE_FILTERS: { label: string; value: StateFilter }[] = [
  { label: "All", value: "all" },
  { label: "Running", value: "running" },
  { label: "Thinking", value: "thinking" },
  { label: "Streaming", value: "streaming" },
  { label: "Approval", value: "approval" },
  { label: "Error", value: "error" },
  { label: "Done", value: "done" },
  { label: "Idle", value: "idle" },
];

export function SessionList({
  sessions,
  activeSessionId,
  viewingSessionId,
  onSessionClick,
  "data-testid": testId,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("lastActivity");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupByCwd, setGroupByCwd] = useState(true);

  const processed = useMemo(() => {
    let filtered = sessions;

    if (stateFilter !== "all") {
      filtered = filtered.filter((s) => s.state === stateFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => s.label.toLowerCase().includes(q));
    }

    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      return vb - va;
    });

    return sorted;
  }, [sessions, stateFilter, searchQuery, sortBy]);

  const groups = useMemo<GroupData[]>(() => {
    if (!groupByCwd) return [];

    const map = new Map<string, Session[]>();
    for (const s of processed) {
      const cwd = s.cwd || "Unknown";
      if (!map.has(cwd)) map.set(cwd, []);
      map.get(cwd)!.push(s);
    }

    return Array.from(map.entries())
      .map(([cwd, groupSessions]) => ({
        cwd,
        label: extractProjectName(cwd),
        sessions: groupSessions,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [processed, groupByCwd]);

  const toggleGroup = (cwd: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) {
        next.delete(cwd);
      } else {
        next.add(cwd);
      }
      return next;
    });
  };

  const renderSession = (s: Session) => {
    const isActive = s.id === activeSessionId;
    const isViewed = s.id === viewingSessionId;
    return (
      <motion.div
        key={s.id}
        className={`session-list__session${isActive ? " session-list__session--active" : ""}${isViewed ? " session-list__session--viewed" : ""}`}
        data-testid="session-item"
        data-session-id={s.id}
        onClick={() => onSessionClick(s)}
        variants={{
          hidden: { opacity: 0, y: 6 },
          show: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <div className="session-list__session-row">
          <StatusDot state={s.state} data-testid="status-dot" />
          <span className="session-list__session-label" title={s.label}>{s.label}</span>
        </div>
        {s.currentTool && (
          <div className="session-list__session-info">
            <span className="session-list__session-tool">{s.currentTool.name}</span>
            {(s.currentTool.input?.file_path as string) && (
              <span className="session-list__session-file">
                {(s.currentTool.input.file_path as string).split("/").pop()}
              </span>
            )}
          </div>
        )}
        {s.lastActivity && (
          <div className="session-list__session-time">{formatTime(s.lastActivity)}</div>
        )}
      </motion.div>
    );
  };

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
          className="session-list__filter"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          data-testid="state-filter"
        >
          {STATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button
          className={`session-list__sort-btn${sortBy === "lastActivity" ? " session-list__sort-btn--active" : ""}`}
          onClick={() => setSortBy(sortBy === "lastActivity" ? "createdAt" : "lastActivity")}
          data-testid="sort-toggle"
          title={sortBy === "lastActivity" ? "Sorted by recent activity" : "Sorted by creation time"}
        >
          {sortBy === "lastActivity" ? "Recent" : "Created"}
        </button>
        <button
          className={`session-list__group-btn${groupByCwd ? " session-list__group-btn--active" : ""}`}
          onClick={() => setGroupByCwd(!groupByCwd)}
          data-testid="group-toggle"
          title={groupByCwd ? "Grouped by project" : "Flat list"}
        >
          Group
        </button>
      </div>

      {processed.length === 0 && sessions.length === 0 && (
        <div className="session-list__empty" data-testid="sessions-empty">Waiting for agent sessions...</div>
      )}
      {processed.length === 0 && sessions.length > 0 && (
        <div className="session-list__empty" data-testid="sessions-empty">No matching sessions</div>
      )}

      {groupByCwd ? (
        <motion.div
          className="session-list__groups"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group.cwd);
            return (
              <motion.div
                key={group.cwd}
                className="session-list__group"
                variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.14, ease: "easeOut" }}
              >
                <div
                  className="session-list__group-header"
                  onClick={() => toggleGroup(group.cwd)}
                  data-testid="group-header"
                  data-group={group.cwd}
                >
                  <span className={`session-list__group-arrow${collapsed ? " session-list__group-arrow--collapsed" : ""}`}>
                    ▾
                  </span>
                  <span className="session-list__group-label" title={group.cwd}>{group.label}</span>
                  <span className="session-list__group-count">{group.sessions.length}</span>
                </div>
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      className="session-list__group-items"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      {group.sessions.map(renderSession)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <motion.div
          className="session-list__flat"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035 } } }}
        >
          {processed.map(renderSession)}
        </motion.div>
      )}
    </div>
  );
}
