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
import { AgentEvent, AgentState, VibeIslandClientOptions, ConnectionState, ConnectionEventHandler, ErrorHandler } from "./types";
export * from "./types";
/**
 * Main client for communicating with Vibe Island
 */
export declare class VibeIslandClient {
    private pipeClient;
    private sessionId;
    /**
     * Create a new Vibe Island client
     *
     * @param options - Client configuration options
     */
    constructor(options?: VibeIslandClientOptions);
    /**
     * Get the current connection state
     */
    get connectionState(): ConnectionState;
    /**
     * Get the current session ID
     */
    get currentSessionId(): string | null;
    /**
     * Set connection state change handler
     */
    onConnectionStateChange(handler: ConnectionEventHandler): this;
    /**
     * Set error handler
     */
    onError(handler: ErrorHandler): this;
    /**
     * Connect to Vibe Island
     */
    connect(): Promise<void>;
    /**
     * Disconnect from Vibe Island
     */
    disconnect(): void;
    /**
     * Start a new agent session
     *
     * @param sessionId - Unique identifier for the session
     * @param label - Human-readable label for the session
     * @param pid - Optional process ID
     */
    startSession(sessionId: string, label: string, pid?: number): Promise<void>;
    /**
     * Update the current session state
     *
     * @param state - New state value
     * @param previousState - Optional previous state for tracking
     */
    setState(state: AgentState, previousState?: AgentState): Promise<void>;
    /**
     * End the current session
     */
    endSession(): Promise<void>;
    /**
     * Send a custom event with arbitrary payload
     *
     * @param state - Current state
     * @param payload - Custom payload data
     */
    sendCustomEvent(state: AgentState, payload?: Record<string, unknown>): Promise<void>;
    /**
     * Send a raw event (for advanced use cases)
     *
     * @param event - Full event object
     */
    sendEvent(event: AgentEvent): Promise<void>;
}
/**
 * Create a new Vibe Island client with default options
 */
export declare function createClient(options?: VibeIslandClientOptions): VibeIslandClient;
export default VibeIslandClient;
//# sourceMappingURL=index.d.ts.map