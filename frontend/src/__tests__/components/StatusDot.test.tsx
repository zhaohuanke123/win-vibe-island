import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusDot } from '../../components/StatusDot'

describe('StatusDot', () => {
  const states = [
    { state: 'idle', expectedClass: 'status-dot--idle' },
    { state: 'running', expectedClass: 'status-dot--running' },
    { state: 'thinking', expectedClass: 'status-dot--thinking' },
    { state: 'streaming', expectedClass: 'status-dot--streaming' },
    { state: 'approval', expectedClass: 'status-dot--approval' },
    { state: 'error', expectedClass: 'status-dot--error' },
    { state: 'done', expectedClass: 'status-dot--done' },
  ] as const

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
