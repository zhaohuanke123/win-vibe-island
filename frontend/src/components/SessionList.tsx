import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { StatusDot } from "./StatusDot";
import { SessionContextMenu } from "./SessionContextMenu";
import type { Session, AgentState } from "../store/sessions";
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

type SortBy = "lastActivity" | "createdAt";
type StateFilter = "all" | AgentState;

interface GroupData {
  tag: string;
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
  onRenameSession,
  onDeleteSession,
  onSetSessionTag,
  onCreateGroup,
  groups,
  "data-testid": testId,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("lastActivity");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupByTag, setGroupByTag] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ session: Session; x: number; y: number } | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSessionId]);

  const processed = useMemo(() => {
    let filtered = sessions;

    if (stateFilter !== "all") {
      filtered = filtered.filter((s) => s.state === stateFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) =>
        s.label.toLowerCase().includes(q) || (s.title && s.title.toLowerCase().includes(q))
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      return vb - va;
    });

    return sorted;
  }, [sessions, stateFilter, searchQuery, sortBy]);

  const groupedData = useMemo<GroupData[]>(() => {
    if (!groupByTag) return [];

    const map = new Map<string, Session[]>();
    for (const s of processed) {
      const tag = s.tag || "";
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(s);
    }

    // Order: store's groups first (in order), then "Ungrouped" at the end
    const result: GroupData[] = [];
    for (const g of groups) {
      const sessions = map.get(g);
      if (sessions) {
        result.push({ tag: g, label: g, sessions });
        map.delete(g);
      }
    }
    // Remaining ungrouped
    const ungrouped = map.get("");
    if (ungrouped) {
      result.push({ tag: "", label: "Ungrouped", sessions: ungrouped });
      map.delete("");
    }
    // Any other tags not in the groups array
    for (const [tag, sessions] of map) {
      result.push({ tag, label: tag, sessions });
    }

    return result;
  }, [processed, groupByTag, groups]);

  const toggleGroup = (tag: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, s: Session) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ session: s, x: e.clientX, y: e.clientY });
  };

  const handleRenameStart = () => {
    if (!contextMenu) return;
    setRenamingSessionId(contextMenu.session.id);
    setRenameValue(contextMenu.session.label);
  };

  const handleRenameSubmit = () => {
    if (renamingSessionId && renameValue.trim()) {
      onRenameSession(renamingSessionId, renameValue.trim());
    }
    setRenamingSessionId(null);
    setRenameValue("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") {
      setRenamingSessionId(null);
      setRenameValue("");
    }
  };

  const renderSession = (s: Session) => {
    const isActive = s.id === activeSessionId;
    const isViewed = s.id === viewingSessionId;
    const isRenaming = renamingSessionId === s.id;

    return (
      <motion.div
        key={s.id}
        className={`session-list__session${isActive ? " session-list__session--active" : ""}${isViewed ? " session-list__session--viewed" : ""}`}
        data-testid="session-item"
        data-session-id={s.id}
        onClick={() => {
          if (!isRenaming) onSessionClick(s);
        }}
        onContextMenu={(e) => handleContextMenu(e, s)}
        variants={{
          hidden: { opacity: 0, y: 6 },
          show: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <div className="session-list__session-row">
          <StatusDot state={s.state} data-testid="status-dot" />
          <div className="session-list__session-text">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="session-list__rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="session-list__session-label" title={s.title || s.label}>
                  {s.title || s.label}
                </span>
                {s.title && (
                  <span className="session-list__session-sublabel" title={s.label}>
                    {s.label}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {s.currentTool && !isRenaming && (
          <div className="session-list__session-info">
            <span className="session-list__session-tool">{s.currentTool.name}</span>
            {(s.currentTool.input?.file_path as string) && (
              <span className="session-list__session-file">
                {(s.currentTool.input.file_path as string).split("/").pop()}
              </span>
            )}
          </div>
        )}
        {s.lastActivity && !isRenaming && (
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
          className={`session-list__group-btn${groupByTag ? " session-list__group-btn--active" : ""}`}
          onClick={() => setGroupByTag(!groupByTag)}
          data-testid="group-toggle"
          title={groupByTag ? "Grouped by tags" : "Flat list"}
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

      {groupByTag ? (
        <motion.div
          className="session-list__groups"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          {groupedData.map((group) => {
            const collapsed = collapsedGroups.has(group.tag);
            return (
              <motion.div
                key={group.tag || "__ungrouped__"}
                className="session-list__group"
                variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.14, ease: "easeOut" }}
              >
                <div
                  className="session-list__group-header"
                  onClick={() => toggleGroup(group.tag)}
                  data-testid="group-header"
                  data-group={group.tag}
                >
                  <span className={`session-list__group-arrow${collapsed ? " session-list__group-arrow--collapsed" : ""}`}>
                    ▾
                  </span>
                  <span className="session-list__group-label">{group.label}</span>
                  <span className="session-list__group-count">{group.sessions.length}</span>
                </div>
                {!collapsed && (
                  <div className="session-list__group-items">
                    {group.sessions.map(renderSession)}
                  </div>
                )}
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

      {contextMenu && (
        <SessionContextMenu
          session={contextMenu.session}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          groups={groups}
          onClose={() => setContextMenu(null)}
          onRename={handleRenameStart}
          onDelete={onDeleteSession}
          onSetTag={onSetSessionTag}
          onCreateGroup={onCreateGroup}
        />
      )}
    </div>
  );
}
