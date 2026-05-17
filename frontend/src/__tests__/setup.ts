import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Polyfill ResizeObserver for jsdom (used by Overlay adaptive height measurement)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as any;

// Polyfill requestAnimationFrame / cancelAnimationFrame for jsdom
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as any;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

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
