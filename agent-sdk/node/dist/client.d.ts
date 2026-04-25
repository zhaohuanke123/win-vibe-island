/**
 * Named Pipe client for Vibe Island
 * Connects to the Windows Named Pipe server at \\.\pipe\VibeIsland
 */
import { AgentEvent, VibeIslandClientOptions, ConnectionState, ConnectionEventHandler, ErrorHandler } from "./types";
/**
 * Named Pipe client that connects to Vibe Island backend
 */
export declare class NamedPipeClient {
    private pipePath;
    private autoReconnect;
    private reconnectDelay;
    private maxReconnectAttempts;
    private connectionTimeout;
    private socket;
    private connectionState;
    private reconnectAttempts;
    private reconnectTimer;
    private connectionTimer;
    private onConnectionChange?;
    private onError?;
    constructor(options?: VibeIslandClientOptions);
    /**
     * Set connection state change handler
     */
    onConnectionStateChange(handler: ConnectionEventHandler): void;
    /**
     * Set error handler
     */
    onErrorMessage(handler: ErrorHandler): void;
    /**
     * Get current connection state
     */
    getState(): ConnectionState;
    /**
     * Connect to the Named Pipe server
     */
    connect(): Promise<void>;
    /**
     * Send an agent event to Vibe Island
     */
    sendEvent(event: AgentEvent): Promise<void>;
    /**
     * Disconnect from the Named Pipe server
     */
    disconnect(): void;
    /**
     * Update connection state and notify handler
     */
    private setConnectionState;
    /**
     * Handle connection disconnect
     */
    private handleDisconnect;
    /**
     * Attempt to reconnect to the server
     */
    private attemptReconnect;
    /**
     * Handle an error
     */
    private handleError;
    /**
     * Clear all timers
     */
    private clearTimers;
    /**
     * Clear connection timer
     */
    private clearConnectionTimer;
    /**
     * Clear reconnect timer
     */
    private clearReconnectTimer;
}
//# sourceMappingURL=client.d.ts.map