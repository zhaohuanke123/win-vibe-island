"""
Named Pipe client for Vibe Island SDK.

Provides a simple API to connect to Vibe Island and send agent events.
Supports auto-reconnect on disconnect.
"""

import json
import logging
import sys
import time
from typing import Any, Callable, Dict, Optional, Union

from .types import (
    AgentEvent,
    AgentState,
    ConnectionStatus,
    DEFAULT_PIPE_NAME,
    StateLiteral,
)

logger = logging.getLogger("vibe_island_sdk")

# Platform-specific imports
if sys.platform == "win32":
    try:
        import pywintypes
        import win32file
        import win32pipe

        HAS_WIN32 = True
    except ImportError:
        HAS_WIN32 = False
        pywintypes = None  # type: ignore
        win32file = None  # type: ignore
        win32pipe = None  # type: ignore
else:
    HAS_WIN32 = False
    pywintypes = None  # type: ignore
    win32file = None  # type: ignore
    win32pipe = None  # type: ignore


class VibeIslandClient:
    """
    Client for communicating with Vibe Island via Named Pipe.

    Usage:
        client = VibeIslandClient()
        client.connect()

        # Send a state change
        client.send_event(AgentEvent(
            session_id="my-session",
            state="running"
        ))

        # Or use convenience methods
        client.set_state("my-session", "running")
        client.session_start("my-session", label="My Agent")

        client.disconnect()

    Supports auto-reconnect on disconnect when enabled.
    """

    def __init__(
        self,
        pipe_name: str = DEFAULT_PIPE_NAME,
        auto_reconnect: bool = True,
        reconnect_delay: float = 1.0,
        connect_timeout: float = 5.0,
        on_status_change: Optional[Callable[[ConnectionStatus], None]] = None,
    ) -> None:
        """
        Initialize the Vibe Island client.

        Args:
            pipe_name: Windows named pipe path (default: \\\\.\\pipe\\VibeIsland)
            auto_reconnect: Enable automatic reconnection on disconnect
            reconnect_delay: Delay in seconds between reconnection attempts
            connect_timeout: Timeout in seconds for initial connection
            on_status_change: Callback for connection status changes
        """
        self.pipe_name = pipe_name
        self.auto_reconnect = auto_reconnect
        self.reconnect_delay = reconnect_delay
        self.connect_timeout = connect_timeout
        self._on_status_change = on_status_change

        self._handle: Optional[int] = None
        self._status = ConnectionStatus.DISCONNECTED
        self._session_id: Optional[str] = None

        if sys.platform != "win32":
            logger.warning("Vibe Island SDK is only supported on Windows")

        if not HAS_WIN32 and sys.platform == "win32":
            raise ImportError(
                "pywin32 is required on Windows. Install with: pip install pywin32"
            )

    @property
    def status(self) -> ConnectionStatus:
        """Current connection status."""
        return self._status

    @property
    def is_connected(self) -> bool:
        """Check if client is connected to the pipe."""
        return self._status == ConnectionStatus.CONNECTED and self._handle is not None

    def _set_status(self, status: ConnectionStatus) -> None:
        """Update connection status and notify callback."""
        if self._status != status:
            self._status = status
            logger.debug("Connection status changed to: %s", status.value)
            if self._on_status_change:
                try:
                    self._on_status_change(status)
                except Exception as e:
                    logger.error("Error in status change callback: %s", e)

    def connect(self, timeout: Optional[float] = None) -> bool:
        """
        Connect to the Vibe Island named pipe server.

        Args:
            timeout: Connection timeout in seconds (default: self.connect_timeout)

        Returns:
            True if connected successfully, False otherwise

        Raises:
            RuntimeError: If not on Windows or pywin32 not installed
        """
        if sys.platform != "win32":
            raise RuntimeError("Named pipes are only supported on Windows")

        if not HAS_WIN32:
            raise RuntimeError("pywin32 is required. Install with: pip install pywin32")

        if self.is_connected:
            logger.debug("Already connected")
            return True

        timeout = timeout or self.connect_timeout
        self._set_status(ConnectionStatus.CONNECTING)

        start_time = time.time()
        attempt = 0

        while time.time() - start_time < timeout:
            attempt += 1
            try:
                logger.debug(
                    "Connecting to pipe %s (attempt %d)", self.pipe_name, attempt
                )

                # Try to open the named pipe
                # GENERIC_WRITE = 0x40000000, OPEN_EXISTING = 3
                self._handle = win32file.CreateFile(  # type: ignore
                    self.pipe_name,
                    win32file.GENERIC_WRITE,  # type: ignore
                    0,  # No sharing
                    None,  # Default security
                    win32file.OPEN_EXISTING,  # type: ignore
                    0,  # Default attributes
                    None,  # No template
                )

                self._set_status(ConnectionStatus.CONNECTED)
                logger.info("Connected to Vibe Island at %s", self.pipe_name)
                return True

            except pywintypes.error as e:  # type: ignore
                # Pipe not available yet, wait and retry
                if e.winerror in (2, 231):  # ERROR_FILE_NOT_FOUND, ERROR_PIPE_BUSY
                    logger.debug(
                        "Pipe not available (error %d), retrying...", e.winerror
                    )
                    time.sleep(0.1)
                else:
                    logger.error("Failed to connect to pipe: %s", e)
                    self._set_status(ConnectionStatus.ERROR)
                    return False

        logger.error("Connection timeout after %.1f seconds", timeout)
        self._set_status(ConnectionStatus.ERROR)
        return False

    def disconnect(self) -> None:
        """
        Disconnect from the named pipe server.

        Safe to call even if not connected.
        """
        if self._handle is not None:
            try:
                win32file.CloseHandle(self._handle)  # type: ignore
            except Exception as e:
                logger.debug("Error closing pipe handle: %s", e)
            finally:
                self._handle = None

        self._set_status(ConnectionStatus.DISCONNECTED)
        logger.info("Disconnected from Vibe Island")

    def _reconnect(self) -> bool:
        """
        Attempt to reconnect to the pipe server.

        Returns:
            True if reconnected successfully, False otherwise
        """
        self._set_status(ConnectionStatus.RECONNECTING)
        self._handle = None

        for attempt in range(3):  # Max 3 reconnection attempts
            logger.debug("Reconnection attempt %d", attempt + 1)
            if self.connect(timeout=self.reconnect_delay):
                return True
            time.sleep(self.reconnect_delay)

        self._set_status(ConnectionStatus.ERROR)
        return False

    def send_event(self, event: AgentEvent) -> bool:
        """
        Send an agent event to Vibe Island.

        Args:
            event: The AgentEvent to send

        Returns:
            True if sent successfully, False otherwise

        Raises:
            RuntimeError: If not connected and auto_reconnect is disabled
        """
        if not self.is_connected:
            if self.auto_reconnect and self._reconnect():
                logger.debug("Auto-reconnected successfully")
            else:
                raise RuntimeError("Not connected to Vibe Island")

        assert self._handle is not None  # For type checker

        try:
            # Serialize event to JSON with newline delimiter
            message = json.dumps(event.to_dict()) + "\n"
            data = message.encode("utf-8")

            win32file.WriteFile(self._handle, data)  # type: ignore
            logger.debug("Sent event: %s", message.strip())
            return True

        except pywintypes.error as e:  # type: ignore
            logger.error("Failed to send event: %s", e)
            self._handle = None
            self._set_status(ConnectionStatus.ERROR)

            if self.auto_reconnect and self._reconnect():
                # Retry sending after reconnection
                return self.send_event(event)

            return False

    def set_state(
        self,
        session_id: str,
        state: Union[StateLiteral, AgentState],
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Send a state change event for a session.

        Convenience method for the most common operation.

        Args:
            session_id: Unique identifier for the agent session
            state: New state (idle, running, approval, done)
            payload: Optional additional payload data

        Returns:
            True if sent successfully
        """
        return self.send_event(
            AgentEvent(session_id=session_id, state=state, payload=payload)
        )

    def session_start(
        self,
        session_id: str,
        label: str = "Agent Session",
        pid: Optional[int] = None,
    ) -> bool:
        """
        Notify Vibe Island of a new session start.

        Args:
            session_id: Unique identifier for the agent session
            label: Human-readable label for the session
            pid: Process ID of the agent (optional)

        Returns:
            True if sent successfully
        """
        from .types import SessionStartPayload

        payload = SessionStartPayload(label=label, pid=pid).to_dict()
        return self.set_state(session_id, "running", payload)

    def session_end(self, session_id: str) -> bool:
        """
        Notify Vibe Island that a session has ended.

        Args:
            session_id: Unique identifier for the agent session

        Returns:
            True if sent successfully
        """
        from .types import SessionEndPayload

        payload = SessionEndPayload().to_dict()
        return self.set_state(session_id, "done", payload)

    def request_approval(
        self,
        session_id: str,
        action: str,
        risk_level: str = "medium",
    ) -> bool:
        """
        Request user approval for an action.

        Args:
            session_id: Unique identifier for the agent session
            action: Description of the action requiring approval
            risk_level: Risk level (low, medium, high)

        Returns:
            True if sent successfully
        """
        from .types import ApprovalPayload

        payload = ApprovalPayload(action=action, risk_level=risk_level).to_dict()
        return self.set_state(session_id, "approval", payload)

    def __enter__(self) -> "VibeIslandClient":
        """Context manager entry - connects to the pipe."""
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit - disconnects from the pipe."""
        self.disconnect()


def create_client(
    pipe_name: str = DEFAULT_PIPE_NAME,
    auto_reconnect: bool = True,
) -> VibeIslandClient:
    """
    Factory function to create a Vibe Island client.

    Args:
        pipe_name: Windows named pipe path
        auto_reconnect: Enable automatic reconnection

    Returns:
        Configured VibeIslandClient instance
    """
    return VibeIslandClient(pipe_name=pipe_name, auto_reconnect=auto_reconnect)
