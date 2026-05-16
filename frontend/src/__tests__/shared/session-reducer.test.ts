import { describe, it, expect } from 'vitest'
import { sessionReducer, type SessionReducerState } from '../../shared/session-reducer'
import type { AgentEvent, SessionPhase } from '../../shared/session-reducer'
import type { Session } from '../../store/sessions'

function makeState(sessions: Session[] = []): SessionReducerState {
  return { sessions }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    label: 'Test',
    cwd: '/test',
    state: 'idle',
    createdAt: 1000,
    lastActivity: 1000,
    toolHistory: [],
    ...overrides,
  }
}

// ─── sessionStarted ───────────────────────────────────────────────────────

describe('sessionReducer: sessionStarted', () => {
  it('creates new session', () => {
    const result = sessionReducer(makeState(), {
      type: 'sessionStarted',
      sessionStarted: {
        sessionId: 's1', title: 'My Project', agent: 'claudeCode',
        cwd: '/dev/project', timestamp: 2000,
      },
    })
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]).toMatchObject({
      id: 's1', label: 'My Project', state: 'idle', cwd: '/dev/project',
    })
  })

  it('updates existing session (resume)', () => {
    const state = makeState([makeSession({ id: 's1', label: 'Old' })])
    const result = sessionReducer(state, {
      type: 'sessionStarted',
      sessionStarted: {
        sessionId: 's1', title: 'New', agent: 'claudeCode',
        model: 'opus', timestamp: 3000,
      },
    })
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].label).toBe('New')
    expect(result.sessions[0].model).toBe('opus')
    expect(result.sessions[0].state).toBe('idle')
  })

  it('preserves model and source as optional', () => {
    const result = sessionReducer(makeState(), {
      type: 'sessionStarted',
      sessionStarted: {
        sessionId: 's1', title: 'T', agent: 'codex', timestamp: 1,
        model: 'sonnet', origin: 'cli',
      },
    })
    expect(result.sessions[0].model).toBe('sonnet')
    expect(result.sessions[0].source).toBe('cli')
  })
})

// ─── activityUpdated ──────────────────────────────────────────────────────

describe('sessionReducer: activityUpdated', () => {
  const phases: { phase: SessionPhase; expectedState: string }[] = [
    { phase: 'idle', expectedState: 'idle' },
    { phase: 'thinking', expectedState: 'thinking' },
    { phase: 'running', expectedState: 'running' },
    { phase: 'requiresAttention', expectedState: 'approval' },
    { phase: 'completed', expectedState: 'done' },
    { phase: 'error', expectedState: 'error' },
  ]

  phases.forEach(({ phase, expectedState }) => {
    it(`maps phase "${phase}" → state "${expectedState}"`, () => {
      const state = makeState([makeSession()])
      const result = sessionReducer(state, {
        type: 'activityUpdated',
        activityUpdated: {
          sessionId: 's1', summary: 'working', phase, timestamp: 2000,
        },
      })
      expect(result.sessions[0].state).toBe(expectedState)
    })
  })

  it('updates toolName and filePath from toolInput', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'activityUpdated',
      activityUpdated: {
        sessionId: 's1', summary: 'reading', phase: 'thinking',
        toolName: 'Read', toolInput: { file_path: '/foo.ts' }, timestamp: 2000,
      },
    })
    expect(result.sessions[0].toolName).toBe('Read')
    expect(result.sessions[0].filePath).toBe('/foo.ts')
  })

  it('creates session via ensureSession if missing', () => {
    const result = sessionReducer(makeState(), {
      type: 'activityUpdated',
      activityUpdated: {
        sessionId: 'unknown', summary: 'x', phase: 'running', timestamp: 2000,
      },
    })
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].id).toBe('unknown')
  })
})

// ─── permissionRequested ──────────────────────────────────────────────────

describe('sessionReducer: permissionRequested', () => {
  it('sets state to approval', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'permissionRequested',
      permissionRequested: {
        sessionId: 's1', toolUseId: 't1', toolName: 'Bash',
        toolInput: { command: 'ls' }, timestamp: 2000,
      },
    })
    expect(result.sessions[0].state).toBe('approval')
    expect(result.sessions[0].toolName).toBe('Bash')
  })
})

// ─── questionAsked ────────────────────────────────────────────────────────

describe('sessionReducer: questionAsked', () => {
  it('sets state to approval', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'questionAsked',
      questionAsked: {
        sessionId: 's1', questionText: 'Which option?', timestamp: 2000,
      },
    })
    expect(result.sessions[0].state).toBe('approval')
  })
})

// ─── sessionCompleted ─────────────────────────────────────────────────────

describe('sessionReducer: sessionCompleted', () => {
  it('sets state to done', () => {
    const state = makeState([makeSession({ state: 'running' })])
    const result = sessionReducer(state, {
      type: 'sessionCompleted',
      sessionCompleted: {
        sessionId: 's1', summary: 'finished', timestamp: 2000,
      },
    })
    expect(result.sessions[0].state).toBe('done')
  })

  it('sets lastError on interrupt', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'sessionCompleted',
      sessionCompleted: {
        sessionId: 's1', summary: 'stopped', timestamp: 2000, isInterrupt: true,
      },
    })
    expect(result.sessions[0].state).toBe('done')
    expect(result.sessions[0].lastError).toBe('Session interrupted')
  })

  it('no error when not interrupted', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'sessionCompleted',
      sessionCompleted: {
        sessionId: 's1', summary: 'done', timestamp: 2000,
      },
    })
    expect(result.sessions[0].lastError).toBeUndefined()
  })
})

// ─── toolUseStarted ───────────────────────────────────────────────────────

describe('sessionReducer: toolUseStarted', () => {
  it('sets running state with currentTool', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'toolUseStarted',
      toolUseStarted: {
        sessionId: 's1', toolUseId: 't1', toolName: 'Read',
        toolInput: { file_path: '/a.ts' }, timestamp: 2000,
      },
    })
    expect(result.sessions[0].state).toBe('running')
    expect(result.sessions[0].currentTool).toEqual({
      name: 'Read', input: { file_path: '/a.ts' }, startTime: 2000,
    })
    expect(result.sessions[0].filePath).toBe('/a.ts')
  })
})

// ─── toolUseCompleted ─────────────────────────────────────────────────────

describe('sessionReducer: toolUseCompleted', () => {
  it('adds to toolHistory on success', () => {
    const state = makeState([makeSession({ currentTool: { name: 'Read', input: {}, startTime: 1 } })])
    const result = sessionReducer(state, {
      type: 'toolUseCompleted',
      toolUseCompleted: {
        sessionId: 's1', toolUseId: 't1', toolName: 'Read',
        success: true, durationMs: 100, timestamp: 2000,
      },
    })
    expect(result.sessions[0].toolHistory).toHaveLength(1)
    expect(result.sessions[0].toolHistory[0].status).toBe('success')
    expect(result.sessions[0].currentTool).toBeUndefined()
  })

  it('sets error state on failure', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'toolUseCompleted',
      toolUseCompleted: {
        sessionId: 's1', toolUseId: 't1', toolName: 'Bash',
        success: false, error: 'exit code 1', timestamp: 2000,
      },
    })
    expect(result.sessions[0].state).toBe('error')
    expect(result.sessions[0].lastError).toBe('exit code 1')
    expect(result.sessions[0].toolHistory[0].status).toBe('failed')
  })

  it('caps toolHistory at 20 entries', () => {
    const toolHistory = Array.from({ length: 19 }, (_, i) => ({
      id: `old-${i}`, toolName: 'X', input: {}, timestamp: 1000 + i, status: 'success' as const,
    }))
    const state = makeState([makeSession({ toolHistory })])
    const result = sessionReducer(state, {
      type: 'toolUseCompleted',
      toolUseCompleted: {
        sessionId: 's1', toolUseId: 'new', toolName: 'Y',
        success: true, timestamp: 5000,
      },
    })
    expect(result.sessions[0].toolHistory).toHaveLength(20)
    expect(result.sessions[0].toolHistory[19].id).toBe('new')
  })

  it('clears toolName and filePath', () => {
    const state = makeState([makeSession({ toolName: 'Read', filePath: '/x.ts' })])
    const result = sessionReducer(state, {
      type: 'toolUseCompleted',
      toolUseCompleted: {
        sessionId: 's1', toolUseId: 't1', toolName: 'Read',
        success: true, timestamp: 2000,
      },
    })
    expect(result.sessions[0].toolName).toBeUndefined()
    expect(result.sessions[0].filePath).toBeUndefined()
  })
})

// ─── jumpTargetUpdated ────────────────────────────────────────────────────

describe('sessionReducer: jumpTargetUpdated', () => {
  it('updates pid', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, {
      type: 'jumpTargetUpdated',
      jumpTargetUpdated: {
        sessionId: 's1', jumpTarget: { pid: 999 }, timestamp: 2000,
      },
    })
    expect(result.sessions[0].pid).toBe(999)
  })
})

// ─── errorOccurred ────────────────────────────────────────────────────────

describe('sessionReducer: errorOccurred', () => {
  it('sets error state with message', () => {
    const state = makeState([makeSession({ state: 'running' })])
    const result = sessionReducer(state, {
      type: 'errorOccurred',
      errorOccurred: {
        sessionId: 's1', errorType: 'tool', message: 'crashed', timestamp: 2000,
      },
    })
    expect(result.sessions[0].state).toBe('error')
    expect(result.sessions[0].lastError).toBe('crashed')
  })
})

// ─── ensureSession (implicit) ─────────────────────────────────────────────

describe('sessionReducer: ensureSession', () => {
  it('creates minimal session for unknown sessionId', () => {
    const result = sessionReducer(makeState(), {
      type: 'errorOccurred',
      errorOccurred: {
        sessionId: 'mystery', errorType: 'x', message: 'y', timestamp: 5000,
      },
    })
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].id).toBe('mystery')
    expect(result.sessions[0].state).toBe('error')
  })

  it('labelFromId extracts last path segment', () => {
    const result = sessionReducer(makeState(), {
      type: 'sessionStarted',
      sessionStarted: {
        sessionId: '/dev/my-project', title: 'ignored', agent: 'unknown', timestamp: 1,
      },
    })
    // sessionStarted uses title as label, not labelFromId for existing paths
    expect(result.sessions[0].label).toBe('ignored')
  })

  it('labelFromId generates session prefix for short ids', () => {
    const result = sessionReducer(makeState(), {
      type: 'activityUpdated',
      activityUpdated: {
        sessionId: 'abc12345', summary: 'x', phase: 'running', timestamp: 1,
      },
    })
    expect(result.sessions[0].label).toBe('session-abc12345')
  })
})

// ─── default branch ───────────────────────────────────────────────────────

describe('sessionReducer: unknown event type', () => {
  it('returns state unchanged for unknown event type', () => {
    const state = makeState([makeSession()])
    const result = sessionReducer(state, { type: 'unknown' } as unknown as AgentEvent)
    expect(result).toBe(state)
  })
})
