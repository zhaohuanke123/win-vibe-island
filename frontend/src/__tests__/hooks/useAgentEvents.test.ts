import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAgentEvents } from '../../hooks/useAgentEvents'
import { useSessionsStore } from '../../store/sessions'
import type { Session } from '../../store/sessions'

// Helper to create a valid Session
function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    label: 'Test',
    cwd: '',
    state: 'idle',
    toolHistory: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ...overrides,
  }
}

// Mock the listen function to capture event handlers
const eventHandlers = new Map<string, (event: { payload: unknown }) => void>()

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((eventName: string, handler: (event: { payload: unknown }) => void) => {
    eventHandlers.set(eventName, handler)
    return Promise.resolve(() => {
      eventHandlers.delete(eventName)
    })
  }),
}))

describe('useAgentEvents', () => {
  beforeEach(() => {
    // Reset store state
    useSessionsStore.setState({
      sessions: [],
      activeSessionId: null,
      approvalRequest: null,
      hookServerStatus: {
        connectionState: 'unknown',
        port: 7878,
      },
      errorLogs: [],
    })
    eventHandlers.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('session_start event', () => {
    it('should create new session on session_start event', async () => {
      renderHook(() => useAgentEvents())

      // Wait for listeners to be set up
      await vi.waitFor(() => {
        expect(eventHandlers.has('session_start')).toBe(true)
      })

      const handler = eventHandlers.get('session_start')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            label: 'Test Project',
            cwd: '/path/to/project',
            source: 'startup',
            model: 'claude-3-opus',
          },
        })
      })

      const sessions = useSessionsStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('session-1')
      expect(sessions[0].label).toBe('Test Project')
      expect(sessions[0].cwd).toBe('/path/to/project')
    })

    it('should update existing session if already exists', async () => {
      // Pre-add session
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        label: 'Old Label',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('session_start')).toBe(true)
      })

      const handler = eventHandlers.get('session_start')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            label: 'New Label',
            cwd: '/new/path',
          },
        })
      })

      const sessions = useSessionsStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].label).toBe('New Label')
    })
  })

  describe('session_end event', () => {
    it('should remove session on session_end event', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('session_end')).toBe(true)
      })

      const handler = eventHandlers.get('session_end')!

      act(() => {
        handler({ payload: { session_id: 'session-1' } })
      })

      expect(useSessionsStore.getState().sessions).toHaveLength(0)
    })
  })

  describe('state_change event', () => {
    it('should update session state', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('state_change')).toBe(true)
      })

      const handler = eventHandlers.get('state_change')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            state: 'running',
          },
        })
      })

      expect(useSessionsStore.getState().sessions[0].state).toBe('running')
    })

    it('should fallback to idle for invalid state', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        state: 'running',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('state_change')).toBe(true)
      })

      const handler = eventHandlers.get('state_change')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            state: 'invalid_state',
          },
        })
      })

      expect(useSessionsStore.getState().sessions[0].state).toBe('idle')
    })

    it('should create session if not exists', async () => {
      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('state_change')).toBe(true)
      })

      const handler = eventHandlers.get('state_change')!

      act(() => {
        handler({
          payload: {
            session_id: 'new-session',
            state: 'thinking',
          },
        })
      })

      const sessions = useSessionsStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('new-session')
      expect(sessions[0].state).toBe('thinking')
    })

    it('should update toolName and filePath when provided', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('state_change')).toBe(true)
      })

      const handler = eventHandlers.get('state_change')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            state: 'thinking',
            tool_name: 'Read',
            tool_input: { file_path: '/test.ts' },
          },
        })
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.toolName).toBe('Read')
      expect(session.filePath).toBe('/test.ts')
    })

    it('should update lastError on error state', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('state_change')).toBe(true)
      })

      const handler = eventHandlers.get('state_change')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            state: 'error',
            message: 'Something went wrong',
          },
        })
      })

      expect(useSessionsStore.getState().sessions[0].lastError).toBe('Something went wrong')
    })
  })

  describe('tool_use event', () => {
    it('should set thinking state and current tool', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        state: 'idle',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('tool_use')).toBe(true)
      })

      const handler = eventHandlers.get('tool_use')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            tool_name: 'Write',
            file_path: '/new-file.ts',
          },
        })
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.state).toBe('thinking')
      expect(session.toolName).toBe('Write')
      expect(session.filePath).toBe('/new-file.ts')
      expect(session.currentTool?.name).toBe('Write')
    })
  })

  describe('tool_complete event', () => {
    it('should add tool execution to history', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        state: 'thinking',
        currentTool: {
          name: 'Read',
          input: { file_path: '/test.ts' },
          startTime: Date.now() - 100,
        },
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('tool_complete')).toBe(true)
      })

      const handler = eventHandlers.get('tool_complete')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            tool_name: 'Read',
            duration_ms: 100,
          },
        })
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.toolHistory).toHaveLength(1)
      expect(session.toolHistory[0].toolName).toBe('Read')
      expect(session.toolHistory[0].duration).toBe(100)
      expect(session.toolHistory[0].status).toBe('success')
    })

    it('should clear current tool after completion', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        state: 'thinking',
        currentTool: {
          name: 'Read',
          input: {},
          startTime: Date.now(),
        },
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('tool_complete')).toBe(true)
      })

      const handler = eventHandlers.get('tool_complete')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            tool_name: 'Read',
            duration_ms: 50,
          },
        })
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.currentTool).toBeUndefined()
      expect(session.toolName).toBeUndefined()
    })
  })

  describe('tool_error event', () => {
    it('should add failed tool execution to history', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        state: 'thinking',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('tool_error')).toBe(true)
      })

      const handler = eventHandlers.get('tool_error')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            tool_name: 'Bash',
            error: 'Command failed',
            duration_ms: 200,
          },
        })
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.toolHistory).toHaveLength(1)
      expect(session.toolHistory[0].status).toBe('failed')
      expect(session.toolHistory[0].error).toBe('Command failed')
      expect(session.lastError).toBe('Command failed')
    })
  })

  describe('permission_request event', () => {
    it('should set approval state and request', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        label: 'Test Project',
        state: 'running',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('permission_request')).toBe(true)
      })

      const handler = eventHandlers.get('permission_request')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            tool_use_id: 'tool-123',
            tool_name: 'Bash',
            action: 'Execute: rm -rf /',
            risk_level: 'high',
          },
        })
      })

      const state = useSessionsStore.getState()
      expect(state.sessions[0].state).toBe('approval')
      expect(state.approvalRequest).not.toBeNull()
      expect(state.approvalRequest?.toolUseId).toBe('tool-123')
      expect(state.approvalRequest?.riskLevel).toBe('high')
    })

    it('should include diff data when provided', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'session-1',
        state: 'running',
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('permission_request')).toBe(true)
      })

      const handler = eventHandlers.get('permission_request')!

      act(() => {
        handler({
          payload: {
            session_id: 'session-1',
            tool_use_id: 'tool-123',
            tool_name: 'Write',
            action: 'Write file: test.ts',
            risk_level: 'medium',
            diff: {
              fileName: 'test.ts',
              filePath: '/test.ts',
              oldContent: 'old',
              newContent: 'new',
            },
          },
        })
      })

      const state = useSessionsStore.getState()
      expect(state.approvalRequest?.diff).toBeDefined()
      expect(state.approvalRequest?.diff?.fileName).toBe('test.ts')
    })
  })

  describe('process_detected event', () => {
    it('should add session for detected agent process', async () => {
      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('process_detected')).toBe(true)
      })

      const handler = eventHandlers.get('process_detected')!

      act(() => {
        handler({
          payload: {
            process: {
              pid: 12345,
              name: 'claude.exe',
              command_line: 'claude code',
              detected_at: Date.now(),
              is_agent: true,
              agent_type: 'claude',
            },
          },
        })
      })

      const sessions = useSessionsStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('process-12345')
      expect(sessions[0].label).toContain('claude')
      expect(sessions[0].pid).toBe(12345)
    })

    it('should not add session for non-agent process', async () => {
      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('process_detected')).toBe(true)
      })

      const handler = eventHandlers.get('process_detected')!

      act(() => {
        handler({
          payload: {
            process: {
              pid: 12345,
              name: 'random.exe',
              command_line: null,
              detected_at: Date.now(),
              is_agent: false,
              agent_type: null,
            },
          },
        })
      })

      expect(useSessionsStore.getState().sessions).toHaveLength(0)
    })
  })

  describe('process_terminated event', () => {
    it('should remove session for terminated process', async () => {
      useSessionsStore.getState().addSession(createSession({
        id: 'process-12345',
        label: 'Claude (PID: 12345)',
        pid: 12345,
      }))

      renderHook(() => useAgentEvents())

      await vi.waitFor(() => {
        expect(eventHandlers.has('process_terminated')).toBe(true)
      })

      const handler = eventHandlers.get('process_terminated')!

      act(() => {
        handler({
          payload: {
            pid: 12345,
            name: 'claude.exe',
            agent_type: 'claude',
          },
        })
      })

      expect(useSessionsStore.getState().sessions).toHaveLength(0)
    })
  })
})
