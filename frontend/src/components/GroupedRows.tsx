import { useState, useMemo, useCallback, memo } from "react";
import { SessionRow } from "./SessionRow";
import { phasePriority, isAttentionPhase, phaseColor } from "../shared/phase-colors";
import { getAgent } from "../shared/agents";
import type { Session, UIPhase } from "../store/sessions";
import "./GroupedRows.css";

const AGENT_KEY_ORDER: Record<string, number> = {
  claude: 0, codex: 1, cursor: 2, gemini: 3, kimi: 4,
  opencode: 5, qoder: 6, qwen: 7, factory: 8, codebuddy: 9,
};

export type GroupBy = "none" | "state" | "agent" | "project";
export type SortBy = "attention" | "updated";

const STALE_THRESHOLD_SEC = 300;

function isStale(s: Session): boolean {
  if (s.state !== "completed") return false;
  return (Date.now() - s.lastActivity) / 1000 > STALE_THRESHOLD_SEC;
}

function extractProjectName(cwd: string): string {
  if (!cwd) return "";
  const normalized = cwd.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || cwd;
}

const STATE_GROUP_ORDER: UIPhase[] = [
  "waitingForApproval",
  "waitingForAnswer",
  "running",
  "completed",
  "idle",
];

const STATE_GROUP_LABELS: Record<UIPhase, string> = {
  waitingForApproval: "Awaiting Approval",
  waitingForAnswer: "Awaiting Answer",
  running: "In progress",
  completed: "Just done",
  idle: "Idle",
};

function sortAttention(a: Session, b: Session): number {
  const pa = phasePriority(a.state);
  const pb = phasePriority(b.state);
  if (pa !== pb) return pb - pa;
  const sa = isStale(a) ? 1 : 0;
  const sb = isStale(b) ? 1 : 0;
  if (sa !== sb) return sa - sb;
  if (isAttentionPhase(a.state) && isAttentionPhase(b.state)) {
    return a.lastActivity - b.lastActivity;
  }
  return b.lastActivity - a.lastActivity;
}

function sortUpdated(a: Session, b: Session): number {
  return b.lastActivity - a.lastActivity;
}

interface GroupDef {
  key: string;
  label: string;
  color?: string;
  sessions: Session[];
  collapsedByDefault?: boolean;
}

function buildGroups(sessions: Session[], groupBy: GroupBy): GroupDef[] {
  if (groupBy === "none") {
    return [{ key: "__all__", label: "", sessions }];
  }

  if (groupBy === "state") {
    const map = new Map<UIPhase, Session[]>();
    for (const phase of STATE_GROUP_ORDER) map.set(phase, []);
    for (const s of sessions) {
      const phase = s.state;
      if (map.has(phase)) map.get(phase)!.push(s);
      else map.set(phase, [s]);
    }
    return STATE_GROUP_ORDER
      .map((phase) => ({
        key: phase,
        label: STATE_GROUP_LABELS[phase],
        color: phaseColor(phase),
        sessions: map.get(phase) ?? [],
        collapsedByDefault: phase === "idle",
      }))
      .filter((g) => g.sessions.length > 0);
  }

  if (groupBy === "agent") {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const agentKey: string = s.agent ?? "claude";
      if (!map.has(agentKey)) map.set(agentKey, []);
      map.get(agentKey)!.push(s);
    }
    const keys = Array.from(map.keys());
    keys.sort((a, b) => (AGENT_KEY_ORDER[a] ?? 99) - (AGENT_KEY_ORDER[b] ?? 99));
    return keys.map((key) => {
      const info = getAgent(key);
      return {
        key,
        label: info.name,
        color: info.color,
        sessions: map.get(key)!,
      };
    });
  }

  if (groupBy === "project") {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const proj = extractProjectName(s.cwd) || "Unknown";
      if (!map.has(proj)) map.set(proj, []);
      map.get(proj)!.push(s);
    }
    const keys = Array.from(map.keys()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    return keys.map((key) => ({
      key,
      label: key,
      sessions: map.get(key)!,
    }));
  }

  return [];
}

interface GroupedRowsProps {
  sessions: Session[];
  groupBy: GroupBy;
  sortBy: SortBy;
  onJump?: (session: Session) => void;
  density?: "comfortable" | "compact";
  onDetail?: (session: Session) => void;
  onContextMenu?: (session: Session, position: { x: number; y: number }) => void;
}

export const GroupedRows = memo(function GroupedRows({
  sessions,
  groupBy,
  sortBy,
  onJump,
  density = "comfortable",
  onDetail,
  onContextMenu,
}: GroupedRowsProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort(sortBy === "attention" ? sortAttention : sortUpdated);
    return copy;
  }, [sessions, sortBy]);

  const groups = useMemo(() => buildGroups(sorted, groupBy), [sorted, groupBy]);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const initialCollapsed = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      if (g.collapsedByDefault) set.add(g.key);
    }
    return set;
  }, [groups]);

  const effectiveCollapsed = useMemo(() => {
    if (collapsed.size === 0) return initialCollapsed;
    return collapsed;
  }, [collapsed, initialCollapsed]);

  if (sessions.length === 0) {
    return (
      <div className="grouped-rows grouped-rows--empty" data-testid="grouped-rows-empty">
        <div className="oi-empty">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <path d="M 6 4 H 38 V 16 A 8 8 0 0 1 30 24 H 14 A 8 8 0 0 1 6 16 Z" fill="none" stroke="rgba(241,234,217,0.2)" strokeWidth="1.5" strokeDasharray="3 3"/>
          </svg>
          <div className="oi-empty__title">No active sessions</div>
          <div className="oi-empty__hint">Start any of <b>10 supported agents</b> in a terminal — <code>claude</code>, <code>codex</code>, <code>cursor</code>, <code>gemini</code>, <code>kimi</code>, <code>opencode</code>, <code>qoder</code>, <code>qwen</code>, <code>droid</code>, <code>codebuddy</code> — sessions auto-appear here.</div>
        </div>
      </div>
    );
  }

  if (groupBy === "none") {
    return (
      <div className="grouped-rows grouped-rows--flat" data-testid="grouped-rows-flat">
        {sorted.map((s) => (
          <SessionRow key={s.id} session={s} onJump={onJump} onDetail={onDetail} onContextMenu={onContextMenu} density={density} groupBy={groupBy} data-testid="flat-row" />
        ))}
      </div>
    );
  }

  return (
    <div className="grouped-rows" data-testid="grouped-rows">
      {groups.map((group) => {
        const isCol = effectiveCollapsed.has(group.key);
        const isState = groupBy === "state";
        const headerClass = isState ? "oi-prio-head" : "oi-grp-head";

        return (
          <div key={group.key} className="grouped-rows__group" data-testid="grouped-group">
            <div
              className={headerClass}
              onClick={() => toggle(group.key)}
              data-testid="group-header"
            >
              <span
                className={`${headerClass}__arrow${isCol ? ` ${headerClass}__arrow--collapsed` : ""}`}
              >
                <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6 l4 4 l4 -4" />
                </svg>
              </span>
              {group.color && (
                <span
                  className={`${headerClass}__dot`}
                  style={{ backgroundColor: group.color }}
                />
              )}
              <span className={`${headerClass}__label`}>{group.label}</span>
              <span className={`${headerClass}__count`}>{group.sessions.length}</span>
            </div>
            {!isCol && (
              <div className="grouped-rows__items" data-testid="group-items">
                {group.sessions.map((s) => (
                  <SessionRow key={s.id} session={s} onJump={onJump} onDetail={onDetail} onContextMenu={onContextMenu} density={density} groupBy={groupBy} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
