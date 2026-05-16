import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionsStore } from '../../store/sessions'
import type { ApprovalRequest } from '../../store/sessions'

function createApprovalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    toolUseId: 'tool-1',
    sessionId: 'session-1',
    sessionLabel: 'Test',
    approvalType: 'permission',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('Approval Queue: navigation & index management', () => {
  beforeEach(() => {
    useSessionsStore.setState({
      sessions: [],
      pendingApprovals: [],
      currentApprovalIndex: 0,
      activeSessionId: null,
      errorLogs: [],
    })
  })

  describe('single approval', () => {
    it('index is 0 after adding one', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(1)
      expect(s.currentApprovalIndex).toBe(0)
    })

    it('removeCurrentApproval empties the queue', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      useSessionsStore.getState().removeCurrentApproval()
      expect(useSessionsStore.getState().pendingApprovals).toHaveLength(0)
      expect(useSessionsStore.getState().currentApprovalIndex).toBe(0)
    })
  })

  describe('three approvals navigation', () => {
    beforeEach(() => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't2' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't3' }))
    })

    it('initially points to first', () => {
      expect(useSessionsStore.getState().currentApprovalIndex).toBe(0)
    })

    it('navigate to next', () => {
      useSessionsStore.getState().setCurrentApprovalIndex(1)
      expect(useSessionsStore.getState().currentApprovalIndex).toBe(1)
    })

    it('navigate to last', () => {
      useSessionsStore.getState().setCurrentApprovalIndex(2)
      expect(useSessionsStore.getState().currentApprovalIndex).toBe(2)
    })

    it('remove first: index stays at 0, items shift', () => {
      useSessionsStore.getState().removeApprovalByToolUseId('t1')
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(2)
      expect(s.pendingApprovals[0].toolUseId).toBe('t2')
      expect(s.currentApprovalIndex).toBe(0)
    })

    it('remove middle: index unchanged if before current', () => {
      useSessionsStore.getState().setCurrentApprovalIndex(2)
      useSessionsStore.getState().removeApprovalByToolUseId('t1')
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(2)
      expect(s.currentApprovalIndex).toBe(1) // shifted down by 1
    })

    it('remove current (middle): index stays at same position', () => {
      useSessionsStore.getState().setCurrentApprovalIndex(1)
      useSessionsStore.getState().removeCurrentApproval()
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(2)
      // t1 and t3 remain; index clamped to Math.min(1, 2-1) = 1
      expect(s.currentApprovalIndex).toBe(1)
    })

    it('remove last (current): index falls back', () => {
      useSessionsStore.getState().setCurrentApprovalIndex(2)
      useSessionsStore.getState().removeCurrentApproval()
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(2)
      expect(s.currentApprovalIndex).toBe(1) // Math.min(2, 1) = 1
    })

    it('remove after current: index unchanged', () => {
      useSessionsStore.getState().setCurrentApprovalIndex(0)
      useSessionsStore.getState().removeApprovalByToolUseId('t2')
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(2)
      expect(s.currentApprovalIndex).toBe(0)
    })

    it('remove all one by one', () => {
      useSessionsStore.getState().removeCurrentApproval() // remove t1
      useSessionsStore.getState().removeCurrentApproval() // remove t2
      useSessionsStore.getState().removeCurrentApproval() // remove t3
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(0)
      expect(s.currentApprovalIndex).toBe(0)
    })
  })

  describe('removeApprovalsBySessionId', () => {
    it('removes all approvals for a session', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1', sessionId: 'sa' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't2', sessionId: 'sb' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't3', sessionId: 'sa' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't4', sessionId: 'sc' }))

      useSessionsStore.getState().removeApprovalsBySessionId('sa')
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(2)
      expect(s.pendingApprovals.map(a => a.sessionId)).toEqual(['sb', 'sc'])
    })

    it('resets index to 0 if current was removed', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1', sessionId: 'sa' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't2', sessionId: 'sa' }))
      useSessionsStore.getState().setCurrentApprovalIndex(1)

      useSessionsStore.getState().removeApprovalsBySessionId('sa')
      expect(useSessionsStore.getState().currentApprovalIndex).toBe(0)
    })

    it('no-op if session has no approvals', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1', sessionId: 'sa' }))
      useSessionsStore.getState().removeApprovalsBySessionId('nonexistent')
      expect(useSessionsStore.getState().pendingApprovals).toHaveLength(1)
    })
  })

  describe('deduplication', () => {
    it('ignores duplicate toolUseId', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      expect(useSessionsStore.getState().pendingApprovals).toHaveLength(1)
    })

    it('allows different toolUseIds', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't2' }))
      expect(useSessionsStore.getState().pendingApprovals).toHaveLength(2)
    })
  })

  describe('clearApprovalRequest', () => {
    it('clears everything', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't2' }))
      useSessionsStore.getState().setCurrentApprovalIndex(1)

      useSessionsStore.getState().clearApprovalRequest()
      const s = useSessionsStore.getState()
      expect(s.pendingApprovals).toHaveLength(0)
      expect(s.currentApprovalIndex).toBe(0)
    })
  })

  describe('index boundary safety', () => {
    it('index never exceeds length-1 after removal', () => {
      for (let i = 0; i < 5; i++) {
        useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: `t${i}` }))
      }
      useSessionsStore.getState().setCurrentApprovalIndex(4)
      useSessionsStore.getState().removeApprovalByToolUseId('t4')
      const s = useSessionsStore.getState()
      expect(s.currentApprovalIndex).toBeLessThan(s.pendingApprovals.length)
    })

    it('index is 0 when queue is empty', () => {
      useSessionsStore.getState().addPendingApproval(createApprovalRequest({ toolUseId: 't1' }))
      useSessionsStore.getState().removeApprovalByToolUseId('t1')
      expect(useSessionsStore.getState().currentApprovalIndex).toBe(0)
    })
  })
})
