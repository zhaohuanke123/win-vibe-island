/**
 * Vibe Island Agent SDK for Node.js
 *
 * A lightweight SDK for injecting into Claude Code sessions and
 * communicating with Vibe Island via Windows Named Pipe.
 *
 * @example
 * ```typescript
 * import { VibeIslandClient, AgentState } from '@vibe-island/agent-sdk';
 *
 * const client = new VibeIslandClient();
 *
 * // Start a session
 * await client.startSession('my-session-id', 'My Agent Session', process.pid);
 *
 * // Report state changes
 * await client.setState('running');
 * await client.setState('approval');
 * await client.setState('done');
 *
 * // End the session
 * await client.endSession();
 * await client.disconnect();
 * ```
 */

import { NamedPipeClient } from "./client";
import {
  AgentEvent,
  AgentState,
  AgentPayload,
  VibeIslandClientOptions,
  ConnectionState,
  ConnectionEventHandler,
  ErrorHandler,
} from "./types";

// Re-export types
export * from "./types";

/**
 * Main client for communicating with Vibe Island
 */
export class VibeIslandClient {
  private pipeClient: NamedPipeClient;
  private sessionId: string | null = null;

  /**
   * Create a new Vibe Island client
   *
   * @param options - Client configuration options
   */
  constructor(options: VibeIslandClientOptions = {}) {
    this.pipeClient = new NamedPipeClient(options);
  }

  /**
   * Get the current connection state
   */
  get connectionState(): ConnectionState {
    return this.pipeClient.getState();
  }

  /**
   * Get the current session ID
   */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set connection state change handler
   */
  onConnectionStateChange(handler: ConnectionEventHandler): this {
    this.pipeClient.onConnectionStateChange(handler);
    return this;
  }

  /**
   * Set error handler
   */
  onError(handler: ErrorHandler): this {
    this.pipeClient.onErrorMessage(handler);
    return this;
  }

  /**
   * Connect to Vibe Island
   */
  async connect(): Promise<void> {
    await this.pipeClient.connect();
  }

  /**
   * Disconnect from Vibe Island
   */
  disconnect(): void {
    this.pipeClient.disconnect();
    this.sessionId = null;
  }

  /**
   * Start a new agent session
   *
   * @param sessionId - Unique identifier for the session
   * @param label - Human-readable label for the session
   * @param pid - Optional process ID
   */
  async startSession(sessionId: string, label: string, pid?: number): Promise<void> {
    this.sessionId = sessionId;

    const event: AgentEvent = {
      session_id: sessionId,
      state: "idle",
      payload: {
        event_type: "session_start",
        label,
        pid,
      } as AgentPayload,
    };

    await this.pipeClient.sendEvent(event);
  }

  /**
   * Update the current session state
   *
   * @param state - New state value
   * @param previousState - Optional previous state for tracking
   */
  async setState(state: AgentState, previousState?: AgentState): Promise<void> {
    if (!this.sessionId) {
      throw new Error("No active session. Call startSession() first.");
    }

    const event: AgentEvent = {
      session_id: this.sessionId,
      state,
      payload: previousState
        ? {
            event_type: "state_change",
            previous_state: previousState,
          }
        : undefined,
    };

    await this.pipeClient.sendEvent(event);
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    if (!this.sessionId) {
      throw new Error("No active session. Call startSession() first.");
    }

    const event: AgentEvent = {
      session_id: this.sessionId,
      state: "done",
      payload: {
        event_type: "session_end",
      } as AgentPayload,
    };

    await this.pipeClient.sendEvent(event);
    this.sessionId = null;
  }

  /**
   * Send a custom event with arbitrary payload
   *
   * @param state - Current state
   * @param payload - Custom payload data
   */
  async sendCustomEvent(state: AgentState, payload?: Record<string, unknown>): Promise<void> {
    if (!this.sessionId) {
      throw new Error("No active session. Call startSession() first.");
    }

    const event: AgentEvent = {
      session_id: this.sessionId,
      state,
      payload,
    };

    await this.pipeClient.sendEvent(event);
  }

  /**
   * Send a raw event (for advanced use cases)
   *
   * @param event - Full event object
   */
  async sendEvent(event: AgentEvent): Promise<void> {
    await this.pipeClient.sendEvent(event);
  }
}

/**
 * Create a new Vibe Island client with default options
 */
export function createClient(options?: VibeIslandClientOptions): VibeIslandClient {
  return new VibeIslandClient(options);
}

// Default export
export default VibeIslandClient;
