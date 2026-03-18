/**
 * @file Global test setup for Vue.js web UI unit tests
 * @description Shared mocks, stubs, and cleanup for all test files.
 *   Conventions follow the TEST_STYLE_GUIDE.md naming patterns adapted
 *   to the Vitest + `@vue/test-utils` assertion API.
 */
import { config } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'

// Global stubs: stub router components in all tests by default
config.global.stubs = {
  RouterLink: true,
  RouterView: true,
}

// Shared mock for vue-toast-notification — used by all component tests
vi.mock('vue-toast-notification', () => ({
  useToast: () => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}))

// Isolation guarantee: clear all mocks and localStorage after each test
afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
