/**
 * Named Pipe client for Vibe Island
 * Connects to the Windows Named Pipe server at \\.\pipe\VibeIsland
 */

import * as net from "net";
import {
  AgentEvent,
  AgentState,
  VibeIslandClientOptions,
  ConnectionState,
  ConnectionEventHandler,
  ErrorHandler,
} from "./types";

/**
 * Default Named Pipe path for Vibe Island
 */
const DEFAULT_PIPE_PATH = "\\\\.\\pipe\\VibeIsland";

/**
 * Named Pipe client that connects to Vibe Island backend
 */
export class NamedPipeClient {
  private pipePath: string;
  private autoReconnect: boolean;
  private reconnectDelay: number;
  private maxReconnectAttempts: number;
  private connectionTimeout: number;

  private socket: net.Socket | null = null;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;

  private onConnectionChange?: ConnectionEventHandler;
  private onError?: ErrorHandler;

  constructor(options: VibeIslandClientOptions = {}) {
    this.pipePath = options.pipePath ?? DEFAULT_PIPE_PATH;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.connectionTimeout = options.connectionTimeout ?? 5000;
  }

  /**
   * Set connection state change handler
   */
  onConnectionStateChange(handler: ConnectionEventHandler): void {
    this.onConnectionChange = handler;
  }

  /**
   * Set error handler
   */
  onErrorMessage(handler: ErrorHandler): void {
    this.onError = handler;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Connect to the Named Pipe server
   */
  connect(): Promise<void> {
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
  sendEvent(event: AgentEvent): Promise<void> {
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
          } else {
            resolve();
          }
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.handleError(error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the Named Pipe server
   */
  disconnect(): void {
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
  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.onConnectionChange?.(state);
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(): void {
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
  private attemptReconnect(): void {
    if (
      this.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      this.handleError(
        new Error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached`)
      );
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
  private handleError(error: Error): void {
    this.onError?.(error);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    this.clearConnectionTimer();
    this.clearReconnectTimer();
  }

  /**
   * Clear connection timer
   */
  private clearConnectionTimer(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
