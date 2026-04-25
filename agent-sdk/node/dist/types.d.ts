/**
 * Event types for Vibe Island Agent SDK
 * Matches the backend Rust AgentEvent schema in src-tauri/src/pipe_server.rs
 */
/**
 * Agent session states that can be reported to Vibe Island
 */
export type AgentState = "idle" | "running" | "approval" | "done";
/**
 * Base agent event sent to Vibe Island via Named Pipe
 */
export interface AgentEvent {
    /** Unique session identifier */
    session_id: string;
    /** Current state: "idle", "running", "approval", "done" */
    state: AgentState;
    /** Optional payload with additional event data */
    payload?: Record<string, unknown>;
}
/**
 * Payload for session_start event
 */
export interface SessionStartPayload {
    /** Event type identifier */
    event_type: "session_start";
    /** Human-readable label for the session */
    label: string;
    /** Process ID of the agent */
    pid?: number;
    [key: string]: unknown;
}
/**
 * Payload for session_end event
 */
export interface SessionEndPayload {
    /** Event type identifier */
    event_type: "session_end";
    [key: string]: unknown;
}
/**
 * Payload for state_change event
 */
export interface StateChangePayload {
    /** Event type identifier */
    event_type: "state_change";
    /** Previous state (optional) */
    previous_state?: AgentState;
    [key: string]: unknown;
}
/**
 * Combined payload types
 */
export type AgentPayload = SessionStartPayload | SessionEndPayload | StateChangePayload | Record<string, unknown>;
/**
 * Options for the Vibe Island client
 */
export interface VibeIslandClientOptions {
    /** Named pipe path (default: \\.\pipe\VibeIsland) */
    pipePath?: string;
    /** Auto-reconnect on disconnect (default: true) */
    autoReconnect?: boolean;
    /** Reconnect delay in milliseconds (default: 1000) */
    reconnectDelay?: number;
    /** Max reconnect attempts (default: 10, 0 = infinite) */
    maxReconnectAttempts?: number;
    /** Connection timeout in milliseconds (default: 5000) */
    connectionTimeout?: number;
}
/**
 * Connection state of the client
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
/**
 * Event handler types
 */
export type ConnectionEventHandler = (state: ConnectionState) => void;
export type ErrorHandler = (error: Error) => void;
//# sourceMappingURL=types.d.ts.map