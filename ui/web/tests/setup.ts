/**
 * @file Global test setup for Vue.js web UI unit tests
 * @description Shared mocks, stubs, and cleanup for all test files.
 *   Conventions follow the TEST_STYLE_GUIDE.md naming patterns adapted
 *   to the Vitest + `@vue/test-utils` assertion API.
 */
import { config } from '@vue/test-utils'
import { afterEach, type Mock, vi } from 'vitest'

// Global stubs: stub router components in all tests by default
config.global.stubs = {
  RouterLink: true,
  RouterView: true,
}

// ── Shared toast mock ─────────────────────────────────────────────────────────
// Shared across all test files. Import `toastMock` from setup.ts to assert on calls.
export const toastMock: { error: Mock; info: Mock; success: Mock; warning: Mock } = {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}

vi.mock('vue-toast-notification', () => ({
  useToast: () => toastMock,
}))

afterEach(() => {
  window.localStorage.clear()
})
