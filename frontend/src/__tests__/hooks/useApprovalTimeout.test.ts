import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useApprovalTimeout } from '../../hooks/useApprovalTimeout'
import { useSessionsStore } from '../../store/sessions'
import { useConfigStore } from '../../store/config'
import type { ApprovalRequest } from '../../store/sessions'

function createApprovalRequest(timestamp: number, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    toolUseId: 'tool-1',
    sessionId: 'session-1',
    sessionLabel: 'Test',
    approvalType: 'permission',
    timestamp,
    ...overrides,
  }
}

describe('useApprovalTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSessionsStore.setState({
      pendingApprovals: [],
      currentApprovalIndex: 0,
    })
    useConfigStore.setState({
      config: {
        ...useConfigStore.getState().config,
        hookServer: {
          ...useConfigStore.getState().config.hookServer,
          permissionTimeoutSecs: 60,
          approvalTimeoutSecs: 120,
        },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with full progress', () => {
    const now = Date.now()
    const { result } = renderHook(() => useApprovalTimeout(createApprovalRequest(now)))
    expect(result.current.progressPercent).toBe(100)
    expect(result.current.isExpired).toBe(false)
    expect(result.current.remainingSeconds).toBeGreaterThan(0)
  })

  it('counts down over time', () => {
    const now = Date.now()
    const { result } = renderHook(() => useApprovalTimeout(createApprovalRequest(now)))

    const initial = result.current.remainingSeconds

    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.remainingSeconds).toBeLessThan(initial)
  })

  it('marks urgent when <= 10 seconds', () => {
    const now = Date.now()
    const request = createApprovalRequest(now - 50000) // 50s ago, 10s left (timeout=60)
    const { result } = renderHook(() => useApprovalTimeout(request))

    expect(result.current.isUrgent).toBe(true)
  })

  it('marks expired when time runs out', () => {
    const now = Date.now()
    const request = createApprovalRequest(now - 61000) // 61s ago (timeout=60)
    const { result } = renderHook(() => useApprovalTimeout(request))

    expect(result.current.isExpired).toBe(true)
    expect(result.current.remainingSeconds).toBe(0)
  })

  it('returns safe state when request is null', () => {
    const { result } = renderHook(() => useApprovalTimeout(null))
    expect(result.current.isExpired).toBe(false)
    expect(result.current.remainingSeconds).toBe(0)
    expect(result.current.isUrgent).toBe(false)
    expect(result.current.progressPercent).toBe(100)
  })

  it('removes approval from store on expiry', () => {
    const now = Date.now()
    const request = createApprovalRequest(now - 61000, { toolUseId: 'expire-test' })
    useSessionsStore.getState().addPendingApproval(request)

    renderHook(() => useApprovalTimeout(request))

    // The hook fires removeApprovalByToolUseId on expiry
    // Since we're past the timeout, it should fire on the next interval tick
    act(() => { vi.advanceTimersByTime(1000) })
    const approvals = useSessionsStore.getState().pendingApprovals
    expect(approvals.find(a => a.toolUseId === 'expire-test')).toBeUndefined()
  })
})
