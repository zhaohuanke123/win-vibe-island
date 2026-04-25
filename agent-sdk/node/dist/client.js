"use strict";
/**
 * Named Pipe client for Vibe Island
 * Connects to the Windows Named Pipe server at \\.\pipe\VibeIsland
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NamedPipeClient = void 0;
const net = __importStar(require("net"));
/**
 * Default Named Pipe path for Vibe Island
 */
const DEFAULT_PIPE_PATH = "\\\\.\\pipe\\VibeIsland";
/**
 * Named Pipe client that connects to Vibe Island backend
 */
class NamedPipeClient {
    constructor(options = {}) {
        this.socket = null;
        this.connectionState = "disconnected";
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.connectionTimer = null;
        this.pipePath = options.pipePath ?? DEFAULT_PIPE_PATH;
        this.autoReconnect = options.autoReconnect ?? true;
        this.reconnectDelay = options.reconnectDelay ?? 1000;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
        this.connectionTimeout = options.connectionTimeout ?? 5000;
    }
    /**
     * Set connection state change handler
     */
    onConnectionStateChange(handler) {
        this.onConnectionChange = handler;
    }
    /**
     * Set error handler
     */
    onErrorMessage(handler) {
        this.onError = handler;
    }
    /**
     * Get current connection state
     */
    getState() {
        return this.connectionState;
    }
    /**
     * Connect to the Named Pipe server
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.connectionState === "connected" || this.connectionState === "connecting") {
                resolve();
                return;
            }
            this.setConnectionState("connecting");
            this.clearTimers();
            this.socket = new net.Socket();
            // Set up connection timeout
            this.connectionTimer = setTimeout(() => {
                this.socket?.destroy();
                const error = new Error(`Connection timeout after ${this.connectionTimeout}ms`);
                this.handleError(error);
                reject(error);
            }, this.connectionTimeout);
            // Handle successful connection
            this.socket.on("connect", () => {
                this.clearConnectionTimer();
                this.setConnectionState("connected");
                this.reconnectAttempts = 0;
                resolve();
            });
            // Handle connection close
            this.socket.on("close", () => {
                this.clearConnectionTimer();
                this.handleDisconnect();
            });
            // Handle errors
            this.socket.on("error", (err) => {
                this.clearConnectionTimer();
                this.handleError(err);
                if (this.connectionState === "connecting") {
                    reject(err);
                }
            });
            // Connect to the Named Pipe
            this.socket.connect(this.pipePath);
        });
    }
    /**
     * Send an agent event to Vibe Island
     */
    sendEvent(event) {
        return new Promise((resolve, reject) => {
            if (!this.socket || this.connectionState !== "connected") {
                reject(new Error("Not connected to Vibe Island"));
                return;
            }
            try {
                // Serialize event to JSON with newline delimiter
                const message = JSON.stringify(event) + "\n";
                this.socket.write(message, (err) => {
                    if (err) {
                        this.handleError(err);
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                this.handleError(error);
                reject(error);
            }
        });
    }
    /**
     * Disconnect from the Named Pipe server
     */
    disconnect() {
        this.autoReconnect = false;
        this.clearTimers();
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.setConnectionState("disconnected");
    }
    /**
     * Update connection state and notify handler
     */
    setConnectionState(state) {
        this.connectionState = state;
        this.onConnectionChange?.(state);
    }
    /**
     * Handle connection disconnect
     */
    handleDisconnect() {
        if (this.connectionState === "connected") {
            this.setConnectionState("disconnected");
        }
        // Attempt reconnect if enabled
        if (this.autoReconnect) {
            this.attemptReconnect();
        }
    }
    /**
     * Attempt to reconnect to the server
     */
    attemptReconnect() {
        if (this.maxReconnectAttempts > 0 &&
            this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.handleError(new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached`));
            return;
        }
        this.reconnectAttempts++;
        this.setConnectionState("reconnecting");
        // Exponential backoff
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(() => {
                // Reconnect failed, will try again if autoReconnect is still true
                if (this.autoReconnect) {
                    this.attemptReconnect();
                }
            });
        }, delay);
    }
    /**
     * Handle an error
     */
    handleError(error) {
        this.onError?.(error);
    }
    /**
     * Clear all timers
     */
    clearTimers() {
        this.clearConnectionTimer();
        this.clearReconnectTimer();
    }
    /**
     * Clear connection timer
     */
    clearConnectionTimer() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }
    }
    /**
     * Clear reconnect timer
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
exports.NamedPipeClient = NamedPipeClient;
//# sourceMappingURL=client.js.map