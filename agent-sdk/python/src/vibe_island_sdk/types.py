"""
Type definitions for Vibe Island SDK.

Matches the backend AgentEvent schema from src-tauri/src/pipe_server.rs.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Literal, Optional, TypedDict, Union


class AgentState(str, Enum):
    """Agent session states recognized by Vibe Island."""

    IDLE = "idle"
    RUNNING = "running"
    APPROVAL = "approval"
    DONE = "done"


StateLiteral = Literal["idle", "running", "approval", "done"]


@dataclass
class AgentEvent:
    """
    Event sent to Vibe Island via Named Pipe.

    Matches backend schema:
    - session_id: Unique identifier for the agent session
    - state: Current state of the agent
    - payload: Optional additional data
    """

    session_id: str
    state: Union[StateLiteral, AgentState]
    payload: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary for JSON serialization."""
        state_value = self.state.value if isinstance(self.state, AgentState) else self.state
        result: Dict[str, Any] = {
            "session_id": self.session_id,
            "state": state_value,
        }
        if self.payload is not None:
            result["payload"] = self.payload
        return result


@dataclass
class SessionStartPayload:
    """Payload for session_start event type."""

    event_type: Literal["session_start"] = "session_start"
    label: str = "Agent Session"
    pid: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"event_type": "session_start", "label": self.label}
        if self.pid is not None:
            result["pid"] = self.pid
        return result


@dataclass
class SessionEndPayload:
    """Payload for session_end event type."""

    event_type: Literal["session_end"] = "session_end"

    def to_dict(self) -> Dict[str, Any]:
        return {"event_type": "session_end"}


class ApprovalPayloadDict(TypedDict):
    """Type for approval-related payload data."""

    event_type: Literal["approval_request"]
    action: str
    risk_level: str


@dataclass
class ApprovalPayload:
    """Payload for approval_request event type."""

    event_type: Literal["approval_request"] = "approval_request"
    action: str = ""
    risk_level: str = "medium"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": "approval_request",
            "action": self.action,
            "risk_level": self.risk_level,
        }


# Default pipe name used by Vibe Island backend
DEFAULT_PIPE_NAME = r"\\.\pipe\VibeIsland"


class ConnectionStatus(str, Enum):
    """Connection status of the SDK client."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    ERROR = "error"
