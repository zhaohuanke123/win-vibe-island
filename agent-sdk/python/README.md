# Vibe Island Python SDK

A lightweight Python SDK for communicating with [Vibe Island](https://github.com/vibe-island/vibe-island) via Windows Named Pipe. Enables AI coding agents (like Codex CLI) to report their state to the Vibe Island overlay.

## Requirements

- Python 3.8+
- Windows (Named Pipes are Windows-only)
- [pywin32](https://pypi.org/project/pywin32/) (automatically installed on Windows)

## Installation

```bash
pip install vibe-island-sdk
```

Or install from source:

```bash
cd agent-sdk/python
pip install -e .
```

## Quick Start

### Basic Usage

```python
from vibe_island_sdk import VibeIslandClient, AgentState

# Using context manager (recommended)
with VibeIslandClient() as client:
    # Start a new session
    client.session_start("my-session", label="Codex Agent", pid=12345)

    # Update state during work
    client.set_state("my-session", AgentState.RUNNING)

    # ... do your agent work ...

    # Request approval for a risky action
    client.request_approval(
        session_id="my-session",
        action="Delete file: /path/to/file.txt",
        risk_level="high"
    )

    # End the session
    client.session_end("my-session")
```

### Manual Connection

```python
from vibe_island_sdk import VibeIslandClient

client = VibeIslandClient(
    pipe_name=r"\\.\pipe\VibeIsland",  # default
    auto_reconnect=True,               # default
    reconnect_delay=1.0,               # seconds
    connect_timeout=5.0,               # seconds
)

try:
    if client.connect():
        client.set_state("my-session", "running")
        # ... do work ...
finally:
    client.disconnect()
```

### With Status Callback

```python
from vibe_island_sdk import VibeIslandClient, ConnectionStatus

def on_status_change(status: ConnectionStatus):
    print(f"Connection status: {status.value}")

client = VibeIslandClient(on_status_change=on_status_change)
client.connect()
```

## API Reference

### VibeIslandClient

The main client class for communicating with Vibe Island.

#### Constructor

```python
VibeIslandClient(
    pipe_name: str = r"\\.\pipe\VibeIsland",
    auto_reconnect: bool = True,
    reconnect_delay: float = 1.0,
    connect_timeout: float = 5.0,
    on_status_change: Optional[Callable[[ConnectionStatus], None]] = None,
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pipe_name` | `str` | Windows named pipe path |
| `auto_reconnect` | `bool` | Enable automatic reconnection on disconnect |
| `reconnect_delay` | `float` | Delay in seconds between reconnection attempts |
| `connect_timeout` | `float` | Timeout in seconds for initial connection |
| `on_status_change` | `Callable` | Callback for connection status changes |

#### Methods

| Method | Description |
|--------|-------------|
| `connect(timeout=None) -> bool` | Connect to Vibe Island |
| `disconnect() -> None` | Disconnect from Vibe Island |
| `send_event(event) -> bool` | Send an `AgentEvent` directly |
| `set_state(session_id, state, payload=None) -> bool` | Update session state |
| `session_start(session_id, label, pid=None) -> bool` | Notify session start |
| `session_end(session_id) -> bool` | Notify session end |
| `request_approval(session_id, action, risk_level) -> bool` | Request user approval |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | `ConnectionStatus` | Current connection status |
| `is_connected` | `bool` | Check if connected |

### AgentEvent

Dataclass representing an event sent to Vibe Island.

```python
from vibe_island_sdk import AgentEvent

event = AgentEvent(
    session_id="my-session",
    state="running",
    payload={"custom": "data"}
)
```

### AgentState

Enum of valid agent states.

```python
from vibe_island_sdk import AgentState

AgentState.IDLE      # "idle"
AgentState.RUNNING   # "running"
AgentState.APPROVAL  # "approval"
AgentState.DONE      # "done"
```

### ConnectionStatus

Enum of connection statuses.

```python
from vibe_island_sdk import ConnectionStatus

ConnectionStatus.DISCONNECTED   # Not connected
ConnectionStatus.CONNECTING     # Attempting connection
ConnectionStatus.CONNECTED      # Successfully connected
ConnectionStatus.RECONNECTING   # Attempting reconnection
ConnectionStatus.ERROR          # Connection error
```

## Integration with Codex CLI

To integrate this SDK with Codex CLI, create a wrapper script:

```python
# codex_wrapper.py
import os
import sys
import uuid
from vibe_island_sdk import VibeIslandClient, AgentState

def run_codex_with_vibe_island():
    session_id = str(uuid.uuid4())[:8]

    with VibeIslandClient() as client:
        # Get process info
        pid = os.getpid()

        # Start session
        client.session_start(session_id, label="Codex CLI", pid=pid)

        try:
            # Run codex command
            client.set_state(session_id, AgentState.RUNNING)

            # ... execute codex CLI or import and call codex directly ...

            client.set_state(session_id, AgentState.DONE)

        except Exception as e:
            client.set_state(session_id, AgentState.IDLE)
            raise

if __name__ == "__main__":
    run_codex_with_vibe_island()
```

## Event Protocol

Events are sent as newline-delimited JSON over the named pipe. Each event matches the backend `AgentEvent` schema:

```json
{
    "session_id": "my-session",
    "state": "running",
    "payload": {
        "event_type": "session_start",
        "label": "Codex Agent",
        "pid": 12345
    }
}
```

### Supported Payload Types

| `event_type` | Fields | Description |
|--------------|--------|-------------|
| `session_start` | `label`, `pid` | Session initialization |
| `session_end` | (none) | Session termination |
| `approval_request` | `action`, `risk_level` | Approval request |

## Error Handling

The SDK handles connection errors gracefully with auto-reconnect:

```python
client = VibeIslandClient(auto_reconnect=True)

# If connection is lost, send_event will:
# 1. Detect the error
# 2. Attempt to reconnect (up to 3 attempts)
# 3. Retry the send if reconnected
# 4. Raise RuntimeError if reconnection fails
```

## Platform Support

- **Windows**: Full support via Named Pipes
- **Linux/macOS**: Not supported (will raise `RuntimeError` on connect)

## License

MIT
