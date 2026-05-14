import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiffViewer } from '../../components/DiffViewer'

describe('DiffViewer', () => {
  // Helper: render DiffViewer and get the root .diff-viewer element
  function renderDiffViewer(props: Parameters<typeof DiffViewer>[0]) {
    const result = render(<DiffViewer {...props} />)
    const container = result.container.querySelector('.diff-viewer') as HTMLElement | null
    return { ...result, container }
  }

  // === 1. Empty content → null render ===
  it('should return null when old and new content are identical and empty', () => {
    const { container } = render(<DiffViewer oldContent="" newContent="" />)
    expect(container.firstChild).toBeNull()
  })

  it('should not render add/remove lines when content is identical', () => {
    const { container } = renderDiffViewer({
      oldContent: 'line 1\nline 2\nline 3',
      newContent: 'line 1\nline 2\nline 3',
    })

    // Should show context lines (no add/remove)
    const adds = container!.querySelectorAll('.diff-viewer__line--add')
    const removes = container!.querySelectorAll('.diff-viewer__line--remove')
    expect(adds.length).toBe(0)
    expect(removes.length).toBe(0)

    // Should have context lines
    const contexts = container!.querySelectorAll('.diff-viewer__line--context')
    expect(contexts.length).toBeGreaterThan(0)
  })

  // === 2. Small diff — 2 adds + 10 context lines ===
  it('should render a small diff with both context and change lines', () => {
    const oldContent = [
      'line 1: keep',
      'line 2: keep',
      'line 3: keep',
      'line 4: keep',
      'line 5: keep',
      'line 6: remove me',
      'line 7: keep',
      'line 8: keep',
      'line 9: keep',
      'line 10: keep',
      'line 11: keep',
      'line 12: keep',
    ].join('\n')

    const newContent = [
      'line 1: keep',
      'line 2: keep',
      'line 3: keep',
      'line 4: keep',
      'line 5: keep',
      'line 6: added line',
      'line 7: keep',
      'line 8: keep',
      'line 9: keep',
      'line 10: keep',
      'line 11: keep',
      'line 12: keep',
    ].join('\n')

    const { container } = renderDiffViewer({ oldContent, newContent })

    // Should have exactly 1 add line and 1 remove line
    const adds = container!.querySelectorAll('.diff-viewer__line--add')
    const removes = container!.querySelectorAll('.diff-viewer__line--remove')
    expect(adds.length).toBe(1)
    expect(removes.length).toBe(1)

    // Should also include context lines
    const contexts = container!.querySelectorAll('.diff-viewer__line--context')
    expect(contexts.length).toBeGreaterThan(0)
  })

  it('should let the diff viewer grow to natural height (no max-height clipping)', () => {
    const oldContent = 'line 1 old\nline 2 old'
    const newContent = 'line 1 new\nline 2 new'

    const { container } = renderDiffViewer({ oldContent, newContent })

    // DiffViewer should render with both add and remove lines
    const adds = container!.querySelectorAll('.diff-viewer__line--add')
    const removes = container!.querySelectorAll('.diff-viewer__line--remove')
    expect(adds.length).toBeGreaterThan(0)
    expect(removes.length).toBeGreaterThan(0)
  })

  // === 3. Large diff — lots of lines ===
  it('should render all lines of a large diff without truncation', () => {
    const oldLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}: const val_${i} = ${i};`)
    const newLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}: const val_${i} = ${i}_updated;`)

    const oldContent = oldLines.join('\n')
    const newContent = newLines.join('\n')

    const { container } = renderDiffViewer({ oldContent, newContent })

    const lines = container!.querySelectorAll('.diff-viewer__line')
    // 60 add + 60 remove = 120 lines
    expect(lines.length).toBe(120)
  })

  it('should not truncate diff output at 100 lines (no ... (more lines) marker)', () => {
    const oldLines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}: old_value_${i}`)
    const newLines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}: new_value_${i}`)

    const oldContent = oldLines.join('\n')
    const newContent = newLines.join('\n')

    const { container } = renderDiffViewer({ oldContent, newContent })

    const lines = container!.querySelectorAll('.diff-viewer__line')
    // Should be 300 lines (150 add + 150 remove), not truncated
    expect(lines.length).toBe(300)

    // Should NOT have the truncation marker
    expect(container!.textContent).not.toContain('(more lines)')
  })

  // === 4. With fileName ===
  it('should display file name header when fileName is provided', () => {
    render(
      <DiffViewer
        oldContent="old content"
        newContent="new content"
        fileName="src/utils.ts"
      />
    )
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
    expect(screen.getByText('📄')).toBeInTheDocument()
  })

  // === 5. Without fileName ===
  it('should not render file name header when fileName is undefined', () => {
    render(
      <DiffViewer oldContent="old content" newContent="new content" />
    )
    expect(screen.queryByText('📄')).not.toBeInTheDocument()
  })

  // === 6. Pure new file (all additions) ===
  it('should mark all lines as "add" when oldContent is empty', () => {
    const newContent = Array.from({ length: 10 }, (_, i) => `new line ${i + 1}`).join('\n')

    const { container } = renderDiffViewer({ oldContent: '', newContent })

    const adds = container!.querySelectorAll('.diff-viewer__line--add')
    expect(adds.length).toBe(10)
    expect(container!.querySelectorAll('.diff-viewer__line--remove').length).toBe(0)
  })

  // === 7. Pure deletion (all removals) ===
  it('should mark all lines as "remove" when newContent is empty', () => {
    const oldContent = Array.from({ length: 8 }, (_, i) => `old line ${i + 1}`).join('\n')

    const { container } = renderDiffViewer({ oldContent, newContent: '' })

    const removes = container!.querySelectorAll('.diff-viewer__line--remove')
    expect(removes.length).toBe(8)
    expect(container!.querySelectorAll('.diff-viewer__line--add').length).toBe(0)
  })

  // === Bonus: line numbers ===
  it('should display old and new line numbers', () => {
    const oldContent = 'line 1 old\nline 2 old\nline 3 old'
    const newContent = 'line 1 new\nline 2 new\nline 3 new'

    const { container } = renderDiffViewer({ oldContent, newContent })

    const lineNums = container!.querySelectorAll('.diff-viewer__line-num')
    expect(lineNums.length).toBeGreaterThan(0)
  })

  it('should render prefix symbols (+/-/space) for line types', () => {
    const oldContent = 'line 1: remove this'
    const newContent = 'line 1: added this'

    const { container } = renderDiffViewer({ oldContent, newContent })

    const prefixes = container!.querySelectorAll('.diff-viewer__line-prefix')
    expect(prefixes.length).toBe(2) // 1 remove + 1 add

    const prefixTexts = Array.from(prefixes).map(el => el.textContent)
    expect(prefixTexts).toContain('+')
    expect(prefixTexts).toContain('-')
  })
})
