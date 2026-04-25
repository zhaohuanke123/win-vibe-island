"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VibeIslandClient = void 0;
exports.createClient = createClient;
const client_1 = require("./client");
// Re-export types
__exportStar(require("./types"), exports);
/**
 * Main client for communicating with Vibe Island
 */
class VibeIslandClient {
    /**
     * Create a new Vibe Island client
     *
     * @param options - Client configuration options
     */
    constructor(options = {}) {
        this.sessionId = null;
        this.pipeClient = new client_1.NamedPipeClient(options);
    }
    /**
     * Get the current connection state
     */
    get connectionState() {
        return this.pipeClient.getState();
    }
    /**
     * Get the current session ID
     */
    get currentSessionId() {
        return this.sessionId;
    }
    /**
     * Set connection state change handler
     */
    onConnectionStateChange(handler) {
        this.pipeClient.onConnectionStateChange(handler);
        return this;
    }
    /**
     * Set error handler
     */
    onError(handler) {
        this.pipeClient.onErrorMessage(handler);
        return this;
    }
    /**
     * Connect to Vibe Island
     */
    async connect() {
        await this.pipeClient.connect();
    }
    /**
     * Disconnect from Vibe Island
     */
    disconnect() {
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
    async startSession(sessionId, label, pid) {
        this.sessionId = sessionId;
        const event = {
            session_id: sessionId,
            state: "idle",
            payload: {
                event_type: "session_start",
                label,
                pid,
            },
        };
        await this.pipeClient.sendEvent(event);
    }
    /**
     * Update the current session state
     *
     * @param state - New state value
     * @param previousState - Optional previous state for tracking
     */
    async setState(state, previousState) {
        if (!this.sessionId) {
            throw new Error("No active session. Call startSession() first.");
        }
        const event = {
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
    async endSession() {
        if (!this.sessionId) {
            throw new Error("No active session. Call startSession() first.");
        }
        const event = {
            session_id: this.sessionId,
            state: "done",
            payload: {
                event_type: "session_end",
            },
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
    async sendCustomEvent(state, payload) {
        if (!this.sessionId) {
            throw new Error("No active session. Call startSession() first.");
        }
        const event = {
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
    async sendEvent(event) {
        await this.pipeClient.sendEvent(event);
    }
}
exports.VibeIslandClient = VibeIslandClient;
/**
 * Create a new Vibe Island client with default options
 */
function createClient(options) {
    return new VibeIslandClient(options);
}
// Default export
exports.default = VibeIslandClient;
//# sourceMappingURL=index.js.map