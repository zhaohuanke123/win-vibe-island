"""
Vibe Island Python SDK

A lightweight SDK for communicating with Vibe Island via Named Pipe.
Enables AI coding agents (like Codex CLI) to report their state to the Vibe Island overlay.

Basic usage:
    from vibe_island_sdk import VibeIslandClient, AgentEvent, AgentState

    # Using context manager (recommended)
    with VibeIslandClient() as client:
        client.session_start("my-session", label="Codex Agent")
        client.set_state("my-session", AgentState.RUNNING)
        # ... do work ...
        client.session_end("my-session")

    # Manual connection
    client = VibeIslandClient()
    client.connect()
    client.set_state("my-session", "running")
    client.disconnect()

Convenience methods:
    - session_start(session_id, label, pid) - Start a new session
    - session_end(session_id) - End a session
    - set_state(session_id, state, payload) - Update session state
    - request_approval(session_id, action, risk_level) - Request user approval
"""

__version__ = "0.1.0"
__author__ = "Vibe Island Team"

from .client import VibeIslandClient, create_client
from .types import (
    AgentEvent,
    AgentState,
    ApprovalPayload,
    ConnectionStatus,
    DEFAULT_PIPE_NAME,
    SessionEndPayload,
    SessionStartPayload,
    StateLiteral,
)

__all__ = [
    # Version
    "__version__",
    # Client
    "VibeIslandClient",
    "create_client",
    # Types
    "AgentEvent",
    "AgentState",
    "StateLiteral",
    "SessionStartPayload",
    "SessionEndPayload",
    "ApprovalPayload",
    "ConnectionStatus",
    "DEFAULT_PIPE_NAME",
]
