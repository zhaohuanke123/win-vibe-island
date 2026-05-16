import { describe, it, expect } from 'vitest'
import { getToolDescription } from '../../shared/tool-description'
import { classifyTool, getCategoryVisual, getToolVisual } from '../../shared/tool-category'
import { extractBashCommand } from '../../utils/command'

// ─── getToolDescription ────────────────────────────────────────────────────

describe('getToolDescription', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['search', { query: 'AI agent' }, 'searching "AI agent"'],
    ['web_search', { q: 'tauri overlay' }, 'searching "tauri overlay"'],
    ['firecrawl_search', { pattern: 'test' }, 'searching "test"'],
    ['scrape', { url: 'https://example.com/page' }, 'fetching example.com/page'],
    ['firecrawl_crawl', { url: 'https://test.org' }, 'fetching test.org'],
    ['Read', { file_path: '/src/components/App.tsx' }, 'reading App.tsx'],
    ['read_file', { path: '/home/user/config.json' }, 'reading config.json'],
    ['Write', { file_path: '/src/main.ts' }, 'editing main.ts'],
    ['Edit', { filePath: 'package.json' }, 'editing package.json'],
    ['Bash', { command: 'npm test' }, '$ npm test'],
    ['Bash', { cmd: 'git commit -m "fix"' }, '$ git commit -m "fix"'],
    ['Bash', { script: 'echo hello\nworld' }, '$ echo hello'],
    ['npm_test', {}, 'running tests...'],
    ['pytest', {}, 'running tests...'],
    ['git_commit', {}, 'git operation...'],
    ['task', {}, 'planning...'],
    ['Search', { pattern: 'TODO' }, 'grep "TODO"'],
    ['grep', { regex: 'FIXME' }, 'grep "FIXME"'],
    ['ls', {}, 'listing files...'],
    ['eslint', {}, 'linting...'],
    ['UnknownTool', {}, 'UnknownTool'],
  ]

  cases.forEach(([toolName, input, expected]) => {
    it(`${toolName} → "${expected}"`, () => {
      expect(getToolDescription(toolName, input)).toBe(expected)
    })
  })

  it('truncates long queries', () => {
    const long = 'a'.repeat(100)
    const result = getToolDescription('search', { query: long })
    expect(result.length).toBeLessThan(long.length)
    expect(result).toContain('...')
  })

  it('returns "working..." for empty tool name', () => {
    expect(getToolDescription('', {})).toBe('working...')
  })

  it('handles missing input fields gracefully', () => {
    expect(getToolDescription('Bash', {})).toBe('running command...')
    expect(getToolDescription('Read', {})).toBe('reading file...')
    expect(getToolDescription('search', {})).toBe('searching...')
  })
})

// ─── classifyTool ─────────────────────────────────────────────────────────

describe('classifyTool', () => {
  const cases: [string, string][] = [
    ['search', 'search'],
    ['firecrawl_search', 'search'],
    ['web_fetch', 'other'], // web_fetch not in classifyTool search regex
    ['Read', 'file_read'],
    ['read_file', 'file_read'],
    ['Write', 'file_write'],
    ['edit_file', 'file_write'],
    ['Bash', 'bash'],
    ['execute_command', 'bash'],
    ['npm_test', 'other'], // npm_test not in test regex (only npm in bash toolDescription)
    ['vitest', 'test'],
    ['git_commit', 'other'], // git_commit not in git regex (only bare 'git')
    ['git', 'git'],
    ['task', 'plan'],
    ['todo_write', 'plan'],
    ['eslint', 'lint'],
    ['cargo_check', 'lint'],
    ['random_tool', 'other'],
    ['mcp_server', 'other'],
  ]

  cases.forEach(([toolName, expected]) => {
    it(`${toolName} → ${expected}`, () => {
      expect(classifyTool(toolName)).toBe(expected)
    })
  })

  it('all 10 categories have visual config', () => {
    const categories = ['search', 'file_read', 'file_write', 'bash', 'test', 'git', 'plan', 'lint', 'approval', 'other']
    categories.forEach((cat) => {
      const visual = getCategoryVisual(cat as any)
      expect(visual.icon).toBeTruthy()
      expect(visual.color).toBeTruthy()
      expect(visual.label).toBeTruthy()
    })
  })
})

// ─── getToolVisual ────────────────────────────────────────────────────────

describe('getToolVisual', () => {
  it('delegates classifyTool + getCategoryVisual', () => {
    const visual = getToolVisual('Bash')
    expect(visual.label).toBe('Bash')
  })
})

// ─── extractBashCommand ───────────────────────────────────────────────────

describe('extractBashCommand', () => {
  it('extracts command field', () => {
    expect(extractBashCommand({ command: 'npm test' })).toBe('npm test')
  })

  it('extracts cmd field', () => {
    expect(extractBashCommand({ cmd: 'git status' })).toBe('git status')
  })

  it('extracts script field', () => {
    expect(extractBashCommand({ script: 'echo hello' })).toBe('echo hello')
  })

  it('prefers command over cmd', () => {
    expect(extractBashCommand({ command: 'first', cmd: 'second' })).toBe('first')
  })

  it('returns null for empty input', () => {
    expect(extractBashCommand(undefined)).toBeNull()
    expect(extractBashCommand(null as any)).toBeNull()
    expect(extractBashCommand({})).toBeNull()
  })

  it('returns null for empty strings', () => {
    expect(extractBashCommand({ command: ' ' })).toBeNull()
    expect(extractBashCommand({ command: '' })).toBeNull()
  })
})
