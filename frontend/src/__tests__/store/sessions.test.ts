import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionsStore } from '../../store/sessions'
import type { Session, ToolExecution, ApprovalRequest } from '../../store/sessions'

describe('SessionsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
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
  })

  describe('addSession', () => {
    it('should add a new session with auto-filled fields', () => {
      const store = useSessionsStore.getState()
      const now = Date.now()

      store.addSession({
        id: 'test-1',
        label: 'Test Project',
        cwd: '/path/to/project',
        state: 'idle',
        toolHistory: [],
      })

      const sessions = useSessionsStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('test-1')
      expect(sessions[0].label).toBe('Test Project')
      expect(sessions[0].createdAt).toBeGreaterThanOrEqual(now)
      expect(sessions[0].lastActivity).toBeGreaterThanOrEqual(now)
      expect(sessions[0].toolHistory).toEqual([])
    })

    it('should preserve provided createdAt and lastActivity', () => {
      const store = useSessionsStore.getState()
      const timestamp = 1715000000000

      store.addSession({
        id: 'test-1',
        label: 'Test',
        cwd: '',
        state: 'idle',
        toolHistory: [],
        createdAt: timestamp,
        lastActivity: timestamp,
      })

      const sessions = useSessionsStore.getState().sessions
      expect(sessions[0].createdAt).toBe(timestamp)
      expect(sessions[0].lastActivity).toBe(timestamp)
    })

    it('should default cwd to empty string', () => {
      const store = useSessionsStore.getState()

      store.addSession({
        id: 'test-1',
        label: 'Test',
        state: 'idle',
        toolHistory: [],
      } as Session)

      const sessions = useSessionsStore.getState().sessions
      expect(sessions[0].cwd).toBe('')
    })
  })

  describe('removeSession', () => {
    it('should remove a session by id', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test 1', cwd: '', state: 'idle', toolHistory: [] })
      store.addSession({ id: 'test-2', label: 'Test 2', cwd: '', state: 'idle', toolHistory: [] })

      store.removeSession('test-1')

      const sessions = useSessionsStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('test-2')
    })

    it('should clear activeSessionId if removed session was active', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })
      store.setActiveSession('test-1')

      store.removeSession('test-1')

      expect(useSessionsStore.getState().activeSessionId).toBeNull()
    })

    it('should not clear activeSessionId if different session was removed', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test 1', cwd: '', state: 'idle', toolHistory: [] })
      store.addSession({ id: 'test-2', label: 'Test 2', cwd: '', state: 'idle', toolHistory: [] })
      store.setActiveSession('test-1')

      store.removeSession('test-2')

      expect(useSessionsStore.getState().activeSessionId).toBe('test-1')
    })
  })

  describe('updateSessionState', () => {
    it('should update session state and lastActivity', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })
      const beforeUpdate = useSessionsStore.getState().sessions[0].lastActivity

      // Small delay to ensure timestamp difference
      store.updateSessionState('test-1', 'running')

      const session = useSessionsStore.getState().sessions[0]
      expect(session.state).toBe('running')
      expect(session.lastActivity).toBeGreaterThanOrEqual(beforeUpdate)
    })

    it('should not update non-existent session', () => {
      const store = useSessionsStore.getState()

      store.updateSessionState('non-existent', 'running')

      expect(useSessionsStore.getState().sessions).toHaveLength(0)
    })
  })

  describe('updateSessionInfo', () => {
    it('should update session info and lastActivity', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })

      store.updateSessionInfo('test-1', {
        label: 'Updated Label',
        toolName: 'Read',
        filePath: '/path/to/file.ts',
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.label).toBe('Updated Label')
      expect(session.toolName).toBe('Read')
      expect(session.filePath).toBe('/path/to/file.ts')
    })

    it('should update state through updateSessionInfo', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })

      store.updateSessionInfo('test-1', { state: 'thinking' })

      expect(useSessionsStore.getState().sessions[0].state).toBe('thinking')
    })
  })

  describe('setActiveSession', () => {
    it('should set active session id', () => {
      const store = useSessionsStore.getState()

      store.setActiveSession('test-1')

      expect(useSessionsStore.getState().activeSessionId).toBe('test-1')
    })

    it('should clear active session id with null', () => {
      const store = useSessionsStore.getState()

      store.setActiveSession('test-1')
      store.setActiveSession(null)

      expect(useSessionsStore.getState().activeSessionId).toBeNull()
    })
  })

  describe('approvalRequest', () => {
    it('should set approval request', () => {
      const store = useSessionsStore.getState()
      const request: ApprovalRequest = {
        toolUseId: 'tool-1',
        sessionId: 'session-1',
        sessionLabel: 'Test Session',
        action: 'Execute command',
        riskLevel: 'medium',
        timestamp: Date.now(),
      }

      store.setApprovalRequest(request)

      expect(useSessionsStore.getState().approvalRequest).toEqual(request)
    })

    it('should clear approval request', () => {
      const store = useSessionsStore.getState()

      store.setApprovalRequest({
        toolUseId: 'tool-1',
        sessionId: 'session-1',
        sessionLabel: 'Test',
        action: 'Test',
        riskLevel: 'low',
        timestamp: Date.now(),
      })

      store.clearApprovalRequest()

      expect(useSessionsStore.getState().approvalRequest).toBeNull()
    })
  })

  describe('hookServerStatus', () => {
    it('should update hook server status', () => {
      const store = useSessionsStore.getState()

      store.setHookServerStatus({
        connectionState: 'connected',
        requestCount: 10,
        uptime: 60,
      })

      const status = useSessionsStore.getState().hookServerStatus
      expect(status.connectionState).toBe('connected')
      expect(status.requestCount).toBe(10)
      expect(status.uptime).toBe(60)
      expect(status.port).toBe(7878) // preserved
    })
  })

  describe('errorLogs', () => {
    it('should add error log with timestamp', () => {
      const store = useSessionsStore.getState()

      store.addErrorLog('Test error')

      const logs = useSessionsStore.getState().errorLogs
      expect(logs).toHaveLength(1)
      expect(logs[0]).toContain('Test error')
      expect(logs[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T/) // ISO timestamp
    })

    it('should limit error logs to 51 entries (keeps last 50)', () => {
      const store = useSessionsStore.getState()

      // Add 52 errors
      for (let i = 0; i < 52; i++) {
        store.addErrorLog(`Error ${i}`)
      }

      const logs = useSessionsStore.getState().errorLogs
      expect(logs.length).toBeLessThanOrEqual(51)
    })

    it('should clear error logs', () => {
      const store = useSessionsStore.getState()

      store.addErrorLog('Error 1')
      store.addErrorLog('Error 2')

      store.clearErrorLogs()

      expect(useSessionsStore.getState().errorLogs).toHaveLength(0)
    })
  })

  describe('toolExecution', () => {
    it('should add tool execution to session', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })

      const execution: ToolExecution = {
        id: 'tool-1',
        toolName: 'Read',
        input: { file_path: '/test.ts' },
        timestamp: Date.now(),
        status: 'success',
      }

      store.addToolExecution('test-1', execution)

      const session = useSessionsStore.getState().sessions[0]
      expect(session.toolHistory).toHaveLength(1)
      expect(session.toolHistory[0].toolName).toBe('Read')
    })

    it('should limit tool history to 20 entries', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })

      // Add 25 executions
      for (let i = 0; i < 25; i++) {
        store.addToolExecution('test-1', {
          id: `tool-${i}`,
          toolName: 'Read',
          input: {},
          timestamp: Date.now(),
          status: 'success',
        })
      }

      const session = useSessionsStore.getState().sessions[0]
      expect(session.toolHistory.length).toBeLessThanOrEqual(20)
    })

    it('should update tool execution', () => {
      const store = useSessionsStore.getState()

      store.addSession({ id: 'test-1', label: 'Test', cwd: '', state: 'idle', toolHistory: [] })

      store.addToolExecution('test-1', {
        id: 'tool-1',
        toolName: 'Read',
        input: {},
        timestamp: Date.now(),
        status: 'pending',
      })

      store.updateToolExecution('test-1', 'tool-1', {
        status: 'success',
        duration: 100,
      })

      const session = useSessionsStore.getState().sessions[0]
      expect(session.toolHistory[0].status).toBe('success')
      expect(session.toolHistory[0].duration).toBe(100)
    })
  })
})
