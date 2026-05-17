import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusDot } from '../../components/StatusDot'
import type { UIPhase } from '../../store/sessions'

describe('StatusDot', () => {
  const states: { state: UIPhase; expectedClass: string }[] = [
    { state: 'idle', expectedClass: 'status-dot--idle' },
    { state: 'running', expectedClass: 'status-dot--running' },
    { state: 'waitingForApproval', expectedClass: 'status-dot--approval' },
    { state: 'waitingForAnswer', expectedClass: 'status-dot--answer' },
    { state: 'completed', expectedClass: 'status-dot--done' },
  ]

  states.forEach(({ state, expectedClass }) => {
    it(`should render with correct class for ${state} state`, () => {
      render(<StatusDot state={state} />)
      // StatusDot renders a motion.span with the class
      const dot = document.querySelector('.status-dot')
      expect(dot).toHaveClass(expectedClass)
    })
  })

  it('should render as a span element', () => {
    render(<StatusDot state="running" />)
    const dot = document.querySelector('.status-dot')
    expect(dot?.tagName).toBe('SPAN')
  })

  it('should have status-dot base class', () => {
    render(<StatusDot state="idle" />)
    const dot = document.querySelector('.status-dot')
    expect(dot).toHaveClass('status-dot')
  })
})
