import '@testing-library/jest-dom/vitest'

// Mock Tauri API
const mockListen = vi.fn(() => Promise.resolve(() => {}))
const mockInvoke = vi.fn(() => Promise.resolve())

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

// Export mocks for use in tests
export { mockListen, mockInvoke }