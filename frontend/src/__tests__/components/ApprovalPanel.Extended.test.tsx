import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApprovalPanel } from '../../components/ApprovalPanel'
import { useSessionsStore } from '../../store/sessions'
import { mockInvoke } from '../setup'

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

function createQuestionRequest(overrides: Partial<any> = {}) {
  return createMockRequest({
    approvalType: 'question',
    questions: [
      {
        question: 'Which approach do you prefer?',
        header: 'Strategy',
        options: [
          { label: 'Option A', description: 'Fast but risky' },
          { label: 'Option B', description: 'Slow but safe' },
        ],
        multiSelect: false,
      },
    ],
    ...overrides,
  })
}

function createPlanRequest(overrides: Partial<any> = {}) {
  return createMockRequest({
    approvalType: 'plan',
    planContent: '# Plan\n\n## Step 1\nDo the first thing\n\n## Step 2\nDo the second thing',
    ...overrides,
  })
}

describe('ApprovalPanel: QuestionPanel', () => {
  const mockOnHandled = vi.fn()

  beforeEach(() => {
    useSessionsStore.setState({
      pendingApprovals: [],
      currentApprovalIndex: 0,
      sessions: [],
    })
    vi.clearAllMocks()
  })

  it('renders question header and question text', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Question')).toBeInTheDocument()
    expect(screen.getByText('Which approach do you prefer?')).toBeInTheDocument()
  })

  it('renders all options as clickable buttons', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('renders custom input field', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByPlaceholderText('Or type your own answer...')).toBeInTheDocument()
  })

  it('highlights selected option', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    const optionA = screen.getByText('Option A')
    fireEvent.click(optionA)
    expect(optionA.closest('.approval-panel__option')).toHaveClass('approval-panel__option--selected')
  })

  it('disables Submit until all questions answered', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Submit')).toBeDisabled()
  })

  it('enables Submit after answering', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Option A'))
    expect(screen.getByText('Submit')).not.toBeDisabled()
  })

  it('invokes submit_approval_response on Submit with answers', async () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Option A'))
    fireEvent.click(screen.getByText('Submit'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit_approval_response', {
        toolUseId: 'tool-1',
        approved: true,
        answers: { 'Which approach do you prefer?': 'Option A' },
      })
    })
  })

  it('invokes submit with approved=false on Skip', async () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit_approval_response', {
        toolUseId: 'tool-1',
        approved: false,
        answers: null,
      })
    })
  })

  it('handles custom input as answer', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    const input = screen.getByPlaceholderText('Or type your own answer...')
    fireEvent.change(input, { target: { value: 'My custom answer' } })
    expect(screen.getByText('Submit')).not.toBeDisabled()
  })

  it('shows question header tag', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Strategy')).toBeInTheDocument()
  })

  it('handles invoke failure gracefully', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('IPC failed'))
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Option A'))
    fireEvent.click(screen.getByText('Submit'))
    await waitFor(() => {
      expect(screen.getByText(/IPC failed/)).toBeInTheDocument()
    })
    // Should be back to pending state
    expect(screen.getByText('Submit')).not.toBeDisabled()
  })

  it('does not render with empty questions array', () => {
    const request = createQuestionRequest({ questions: [] })
    const { container } = render(<ApprovalPanel request={request} onApprovalHandled={mockOnHandled} />)
    expect(container.querySelector('.approval-panel')).toBeNull()
  })
})

describe('ApprovalPanel: PlanPanel', () => {
  const mockOnHandled = vi.fn()

  beforeEach(() => {
    useSessionsStore.setState({
      pendingApprovals: [],
      currentApprovalIndex: 0,
      sessions: [],
    })
    vi.clearAllMocks()
  })

  it('renders plan header', () => {
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    // markdown also renders <h1>Plan</h1>, so there are multiple "Plan" texts
    const planElements = screen.getAllByText('Plan')
    expect(planElements.length).toBeGreaterThanOrEqual(2) // header title + markdown heading
  })

  it('renders plan content as markdown', () => {
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('Step 2')).toBeInTheDocument()
  })

  it('renders Proceed and Cancel buttons', () => {
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Proceed')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('invokes approved=true on Proceed', async () => {
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Proceed'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit_approval_response', {
        toolUseId: 'tool-1',
        approved: true,
        answers: null,
      })
    })
  })

  it('invokes approved=false on Cancel', async () => {
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('submit_approval_response', {
        toolUseId: 'tool-1',
        approved: false,
        answers: null,
      })
    })
  })

  it('shows session label', () => {
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('handles missing planContent gracefully', () => {
    render(<ApprovalPanel request={createPlanRequest({ planContent: undefined })} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('No plan content provided')).toBeInTheDocument()
  })

  it('handles invoke failure on Proceed', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('IPC failed'))
    render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    fireEvent.click(screen.getByText('Proceed'))
    await waitFor(() => {
      expect(screen.getByText(/IPC failed/)).toBeInTheDocument()
    })
  })

  it('renders steps from plan option descriptions', () => {
    const request = createMockRequest({
      approvalType: 'question',
      questions: [
        {
          question: 'Review this plan?',
          header: 'Plan',
          options: [
            {
              label: 'Approve',
              description: '1. Read architecture.md\n2. Write tests\n3. Implement',
            },
            { label: 'Modify', description: 'Make changes' },
          ],
          multiSelect: false,
        },
      ],
    })
    render(<ApprovalPanel request={request} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Read architecture.md')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getByText('Implement')).toBeInTheDocument()
  })
})

describe('ApprovalPanel: routing by approvalType', () => {
  const mockOnHandled = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes to PermissionPanel for approvalType=permission', () => {
    render(<ApprovalPanel request={createMockRequest({ approvalType: 'permission' })} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Approval Required')).toBeInTheDocument()
  })

  it('routes to QuestionPanel for approvalType=question', () => {
    render(<ApprovalPanel request={createQuestionRequest()} onApprovalHandled={mockOnHandled} />)
    expect(screen.getByText('Question')).toBeInTheDocument()
  })

  it('routes to PlanPanel for approvalType=plan', () => {
    const { container } = render(<ApprovalPanel request={createPlanRequest()} onApprovalHandled={mockOnHandled} />)
    expect(container.querySelector('.approval-panel--plan')).toBeInTheDocument()
  })

  it('returns null when request is null', () => {
    const { container } = render(<ApprovalPanel request={null} onApprovalHandled={mockOnHandled} />)
    expect(container.innerHTML).toBe('')
  })
})
