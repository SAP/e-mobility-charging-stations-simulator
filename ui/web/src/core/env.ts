/**
 * Whether the application runs in a real DEV environment (`pnpm dev` /
 * Vite serve), excluding production builds and Vitest runs. Use to gate
 * dev-only diagnostics that would otherwise emit noise in tests or race
 * environment teardown via `requestAnimationFrame` / async callbacks.
 * @returns Whether the runtime is DEV and not a Vitest test run
 */
export const isDev = (): boolean => import.meta.env.DEV && import.meta.env.MODE !== 'test'
