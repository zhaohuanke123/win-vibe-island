# @vibe-island/agent-sdk

Node.js SDK for [Vibe Island](https://github.com/vibe-island/vibe-island) agent session monitoring. This SDK allows Claude Code and other Node.js-based AI coding agents to report their state to Vibe Island via Windows Named Pipe.

## Installation

```bash
npm install @vibe-island/agent-sdk
```

## Quick Start

```typescript
import { VibeIslandClient } from '@vibe-island/agent-sdk';

// Create client
const client = new VibeIslandClient();

// Connect to Vibe Island
await client.connect();

// Start a session
await client.startSession('session-123', 'My Agent Session', process.pid);

// Report state changes
await client.setState('running');  // Agent is working
await client.setState('approval'); // Agent needs approval
await client.setState('done');     // Agent finished

// End session and disconnect
await client.endSession();
client.disconnect();
```

## API Reference

### `VibeIslandClient`

Main client class for communicating with Vibe Island.

#### Constructor

```typescript
const client = new VibeIslandClient(options?: VibeIslandClientOptions);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pipePath` | `string` | `\\.\pipe\VibeIsland` | Named Pipe path |
| `autoReconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectDelay` | `number` | `1000` | Initial reconnect delay (ms) |
| `maxReconnectAttempts` | `number` | `10` | Max reconnect attempts (0 = infinite) |
| `connectionTimeout` | `number` | `5000` | Connection timeout (ms) |

#### Methods

##### `connect(): Promise<void>`

Connect to the Vibe Island Named Pipe server.

```typescript
await client.connect();
```

##### `disconnect(): void`

Disconnect from Vibe Island.

```typescript
client.disconnect();
```

##### `startSession(sessionId, label, pid?): Promise<void>`

Start a new agent session.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | `string` | Unique session identifier |
| `label` | `string` | Human-readable session label |
| `pid` | `number` | Optional process ID |

```typescript
await client.startSession('my-session', 'Claude Code', process.pid);
```

##### `setState(state, previousState?): Promise<void>`

Update the current session state.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | `AgentState` | New state value |
| `previousState` | `AgentState` | Optional previous state |

```typescript
await client.setState('running');
await client.setState('approval');
await client.setState('done');
```

##### `endSession(): Promise<void>`

End the current session.

```typescript
await client.endSession();
```

##### `sendCustomEvent(state, payload?): Promise<void>`

Send a custom event with arbitrary payload.

```typescript
await client.sendCustomEvent('running', {
  task: 'Refactoring code',
  files: ['src/index.ts', 'src/utils.ts']
});
```

#### Event Handlers

##### `onConnectionStateChange(handler)`

Register a handler for connection state changes.

```typescript
client.onConnectionStateChange((state) => {
  console.log(`Connection state: ${state}`);
  // States: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
});
```

##### `onError(handler)`

Register an error handler.

```typescript
client.onError((error) => {
  console.error('SDK error:', error.message);
});
```

### Types

#### `AgentState`

Session states that can be reported to Vibe Island.

```typescript
type AgentState = "idle" | "running" | "approval" | "done";
```

| State | Description |
|-------|-------------|
| `idle` | Agent is idle, waiting for input |
| `running` | Agent is actively working |
| `approval` | Agent needs user approval |
| `done` | Agent has completed its task |

#### `AgentEvent`

Event structure sent to Vibe Island.

```typescript
interface AgentEvent {
  session_id: string;
  state: AgentState;
  payload?: Record<string, unknown>;
}
```

#### `ConnectionState`

Current connection state of the client.

```typescript
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
```

## Integration with Claude Code

To integrate this SDK into Claude Code, you can create a hook script that reports Claude Code's state:

```typescript
// In your Claude Code hook or wrapper script
import { VibeIslandClient } from '@vibe-island/agent-sdk';

const client = new VibeIslandClient();

async function main() {
  try {
    await client.connect();
    await client.startSession(
      process.env.CLAUDE_SESSION_ID || `claude-${Date.now()}`,
      'Claude Code',
      process.pid
    );

    // Hook into Claude Code lifecycle
    process.on('SIGINT', async () => {
      await client.endSession();
      client.disconnect();
      process.exit(0);
    });

    // Your Claude Code integration here...
  } catch (error) {
    console.error('Failed to connect to Vibe Island:', error);
  }
}

main();
```

## Platform Support

This SDK is designed for **Windows only** as it uses Windows Named Pipes (`\\.\pipe\VibeIsland`) for communication. On non-Windows platforms, connection attempts will fail with an error.

## Error Handling

The SDK emits errors through the `onError` handler. Common errors include:

- **Connection timeout**: Vibe Island is not running
- **Pipe not found**: Vibe Island pipe server has not started
- **Broken pipe**: Connection was terminated unexpectedly
- **Max reconnect attempts**: Auto-reconnect failed after configured attempts

```typescript
client.onError((error) => {
  if (error.message.includes('timeout')) {
    console.log('Vibe Island is not running. Please start Vibe Island first.');
  }
});
```

## License

MIT
