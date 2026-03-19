/**
 * @file Shared test utilities for Vue.js web UI unit tests
 * @description MockWebSocket, withSetup composable helper, mock factories.
 */
import { flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'
import { type App, createApp } from 'vue'

import { ResponseStatus } from '@/types'

export { flushPromises as flushAllPromises }

// ── MockUIClient ──────────────────────────────────────────────────────────────

export interface MockUIClient {
  addChargingStations: ReturnType<typeof vi.fn>
  authorize: ReturnType<typeof vi.fn>
  closeConnection: ReturnType<typeof vi.fn>
  deleteChargingStation: ReturnType<typeof vi.fn>
  listChargingStations: ReturnType<typeof vi.fn>
  listTemplates: ReturnType<typeof vi.fn>
  openConnection: ReturnType<typeof vi.fn>
  registerWSEventListener: ReturnType<typeof vi.fn>
  setConfiguration: ReturnType<typeof vi.fn>
  setSupervisionUrl: ReturnType<typeof vi.fn>
  simulatorState: ReturnType<typeof vi.fn>
  startAutomaticTransactionGenerator: ReturnType<typeof vi.fn>
  startChargingStation: ReturnType<typeof vi.fn>
  startSimulator: ReturnType<typeof vi.fn>
  startTransaction: ReturnType<typeof vi.fn>
  stopAutomaticTransactionGenerator: ReturnType<typeof vi.fn>
  stopChargingStation: ReturnType<typeof vi.fn>
  stopSimulator: ReturnType<typeof vi.fn>
  stopTransaction: ReturnType<typeof vi.fn>
  unregisterWSEventListener: ReturnType<typeof vi.fn>
}

// ── ButtonStub ────────────────────────────────────────────────────────────────

/** Functional Button stub that preserves click event propagation. */
export const ButtonStub = {
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
}

// ── MockWebSocket ─────────────────────────────────────────────────────────────

export class MockWebSocket {
  static readonly CLOSED = 3
  static readonly CLOSING = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1

  addEventListener: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readonly CLOSED = 3
  readonly CLOSING = 2
  readonly CONNECTING = 0
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  readonly OPEN = 1
  readyState: number = MockWebSocket.OPEN
  removeEventListener: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  sentMessages: string[] = []

  constructor (
    public readonly url = '',
    public readonly protocols: string | string[] = []
  ) {
    this.addEventListener = vi.fn()
    this.close = vi.fn()
    this.removeEventListener = vi.fn()
    // Intercept send to capture messages
    this.send = vi.fn((data: string) => {
      this.sentMessages.push(data)
    })
    // Simulate async open
    setTimeout(() => {
      this.onopen?.()
    }, 0)
  }

  simulateClose (code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED
    const event = { code, reason } as CloseEvent
    this.onclose?.(event)
  }

  simulateError (): void {
    const event = new Event('error')
    this.onerror?.(event)
  }

  simulateMessage (data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>
    this.onmessage?.(event)
  }
}

// ── createMockUIClient ────────────────────────────────────────────────────────

/**
 * Creates a mock UIClient with all methods returning success responses.
 * @returns MockUIClient with all methods mocked
 */
export function createMockUIClient (): MockUIClient {
  const successResponse = { status: ResponseStatus.SUCCESS }
  return {
    addChargingStations: vi.fn().mockResolvedValue(successResponse),
    authorize: vi.fn().mockResolvedValue(successResponse),
    closeConnection: vi.fn().mockResolvedValue(successResponse),
    deleteChargingStation: vi.fn().mockResolvedValue(successResponse),
    listChargingStations: vi.fn().mockResolvedValue({ ...successResponse, chargingStations: [] }),
    listTemplates: vi.fn().mockResolvedValue({ ...successResponse, templates: [] }),
    openConnection: vi.fn().mockResolvedValue(successResponse),
    registerWSEventListener: vi.fn(),
    setConfiguration: vi.fn(),
    setSupervisionUrl: vi.fn().mockResolvedValue(successResponse),
    simulatorState: vi
      .fn()
      .mockResolvedValue({ ...successResponse, state: { started: false, templateStatistics: {} } }),
    startAutomaticTransactionGenerator: vi.fn().mockResolvedValue(successResponse),
    startChargingStation: vi.fn().mockResolvedValue(successResponse),
    startSimulator: vi.fn().mockResolvedValue(successResponse),
    startTransaction: vi.fn().mockResolvedValue(successResponse),
    stopAutomaticTransactionGenerator: vi.fn().mockResolvedValue(successResponse),
    stopChargingStation: vi.fn().mockResolvedValue(successResponse),
    stopSimulator: vi.fn().mockResolvedValue(successResponse),
    stopTransaction: vi.fn().mockResolvedValue(successResponse),
    unregisterWSEventListener: vi.fn(),
  }
}

// ── withSetup ─────────────────────────────────────────────────────────────────
// Official Vue core team pattern for testing composables with lifecycle hooks

/**
 * Composable testing helper per Vue core team pattern. Creates a minimal app to run composable with lifecycle hooks.
 * @param composable - The composable function to test
 * @param options - Optional configuration with provide object
 * @param options.provide - Optional provide object for dependency injection
 * @returns Tuple of [composable result, app instance]
 */
export function withSetup<T> (
  composable: () => T,
  options?: { provide?: Record<string | symbol, unknown> }
): [T, App] {
  let result!: T
  const app = createApp({
    setup () {
      result = composable()
      // Suppress missing template warning
      return () => null
    },
  })
  if (options?.provide != null) {
    for (const [key, value] of Object.entries(options.provide)) {
      app.provide(key, value)
    }
  }
  app.mount(document.createElement('div'))
  return [result, app]
}
