import { useEffect, useRef, useState } from "react";
import type { Session } from "../store/sessions";
import "./SessionContextMenu.css";

interface SessionContextMenuProps {
  session: Session;
  position: { x: number; y: number };
  groups: string[];
  onClose: () => void;
  onRename: () => void;
  onDelete: (id: string) => void;
  onSetTag: (id: string, tag?: string) => void;
  onCreateGroup: (name: string) => void;
}

export function SessionContextMenu({
  session,
  position,
  groups,
  onClose,
  onRename,
  onDelete,
  onSetTag,
  onCreateGroup,
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (showNewGroupInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewGroupInput]);

  // Clamp position to viewport
  const menuStyle = { left: position.x, top: position.y };

  const handleNewGroupSubmit = () => {
    const name = newGroupName.trim();
    if (name) {
      onCreateGroup(name);
      onSetTag(session.id, name);
      onClose();
    }
  };

  const hasGroups = groups.length > 0;

  return (
    <div className="session-context-menu" ref={menuRef} style={menuStyle}>
      <div
        className="session-context-menu__item"
        onClick={() => { onRename(); onClose(); }}
      >
        Rename
      </div>
      <div
        className="session-context-menu__item session-context-menu__item--danger"
        onClick={() => { onDelete(session.id); onClose(); }}
      >
        Delete
      </div>

      <div className="session-context-menu__divider" />

      {session.tag && (
        <div
          className="session-context-menu__item"
          onClick={() => { onSetTag(session.id, undefined); onClose(); }}
        >
          Remove from group
        </div>
      )}

      {hasGroups && groups.map((group) => (
        <div
          key={group}
          className="session-context-menu__item"
          onClick={() => { onSetTag(session.id, group); onClose(); }}
        >
          <span className={session.tag === group ? "session-context-menu__check" : "session-context-menu__check--empty"}>
            {session.tag === group ? "✓" : ""}
          </span>
          {group}
        </div>
      ))}

      {showNewGroupInput ? (
        <input
          ref={inputRef}
          className="session-context-menu__new-group-input"
          placeholder="Group name..."
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNewGroupSubmit();
            if (e.key === "Escape") onClose();
          }}
          onBlur={() => {
            if (!newGroupName.trim()) setShowNewGroupInput(false);
          }}
        />
      ) : (
        <div
          className="session-context-menu__item"
          onClick={() => setShowNewGroupInput(true)}
        >
          New group...
        </div>
      )}
    </div>
  );
}
