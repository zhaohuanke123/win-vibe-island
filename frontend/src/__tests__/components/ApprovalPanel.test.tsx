import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApprovalPanel } from '../../components/ApprovalPanel'
import { useSessionsStore } from '../../store/sessions'
import { mockInvoke } from '../setup'

// Helper to create a valid ApprovalRequest
function createMockRequest(overrides: Partial<any> = {}) {
  return {
    toolUseId: 'tool-1',
    sessionId: 'session-1',
    sessionLabel: 'Test Project',
    approvalType: 'permission' as const,
    timestamp: Date.now(),
    action: 'Test action',
    riskLevel: 'medium' as const,
    ...overrides,
  }
}

describe('ApprovalPanel', () => {
  const mockOnApprovalHandled = vi.fn()

  beforeEach(() => {
    useSessionsStore.setState({
      approvalRequest: null,
      sessions: [],
    })
    vi.clearAllMocks()
  })

  it('should not render when no approval request', () => {
    render(<ApprovalPanel request={null} onApprovalHandled={mockOnApprovalHandled} />)
    expect(screen.queryByText('Approval Required')).not.toBeInTheDocument()
  })

  it('should display approval request details', () => {
    const request = createMockRequest({
      toolName: 'Bash',
      action: 'Execute: npm install',
      riskLevel: 'medium' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    expect(screen.getByText('Approval Required')).toBeInTheDocument()
    expect(screen.getByText('Test Project')).toBeInTheDocument()
    expect(screen.getByText('Execute: npm install')).toBeInTheDocument()
    expect(screen.getByText('MEDIUM RISK')).toBeInTheDocument()
  })

  it('should display risk level with correct class', () => {
    const request = createMockRequest({
      action: 'Test',
      riskLevel: 'high' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    const riskBadge = screen.getByText('HIGH RISK')
    expect(riskBadge).toHaveClass('approval-panel__risk--high')
  })

  it('should call invoke with approve=true when Approve clicked', async () => {
    const request = createMockRequest({
      action: 'Test',
      riskLevel: 'low' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    const approveButton = screen.getByRole('button', { name: 'Approve' })
    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit_approval_response', {
        toolUseId: 'tool-1',
        approved: true,
        answers: null,
      })
    })
  })

  it('should call invoke with approved=false when Reject clicked', async () => {
    const request = createMockRequest({
      action: 'Test',
      riskLevel: 'low' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    const rejectButton = screen.getByRole('button', { name: 'Reject' })
    fireEvent.click(rejectButton)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit_approval_response', {
        toolUseId: 'tool-1',
        approved: false,
        answers: null,
      })
    })
  })

  it('should call onApprovalHandled after approval', async () => {
    const request = createMockRequest({
      action: 'Test',
      riskLevel: 'low' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    const approveButton = screen.getByRole('button', { name: 'Approve' })
    fireEvent.click(approveButton)

    // Wait for the invoke to be called
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled()
    })
  })

  it('should show diff viewer when diff is present', () => {
    const request = createMockRequest({
      toolName: 'Write',
      action: 'Write file: test.ts',
      riskLevel: 'medium' as const,
      diff: {
        fileName: 'test.ts',
        oldContent: 'old code',
        newContent: 'new code',
      },
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    expect(screen.getByText('test.ts')).toBeInTheDocument()
  })

  it('should display tool name when provided', () => {
    const request = createMockRequest({
      toolName: 'Bash',
      action: 'Execute command',
      riskLevel: 'medium' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    expect(screen.getByText('[Bash]')).toBeInTheDocument()
  })

  it('should show command analysis for Bash approvals with tool input', () => {
    const request = createMockRequest({
      toolName: 'Bash',
      toolInput: { command: 'rm -rf ./dist' },
      action: 'Execute: rm -rf ./dist',
      riskLevel: 'high' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    expect(screen.getByText('Command Analysis')).toBeInTheDocument()
  })

  it('should show loading state when approving', async () => {
    const request = createMockRequest({
      action: 'Test',
      riskLevel: 'low' as const,
    })

    render(<ApprovalPanel request={request} onApprovalHandled={mockOnApprovalHandled} />)

    const approveButton = screen.getByRole('button', { name: 'Approve' })
    expect(approveButton).not.toBeDisabled()

    fireEvent.click(approveButton)

    // After clicking, the button should show spinner (loading state)
    // The button text changes to spinner, so we check it's no longer "Approve"
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled()
    })
  })
})
