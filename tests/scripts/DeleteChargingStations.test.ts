/**
 * @file Tests for the persistent Driivz charger deletion workflow
 * @description Verifies lifecycle sequencing, recovery, and parent resource protection.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface ChargerState {
  attempts: number
  charger?: typeof CHARGER
  decommissionAttemptedAt?: string
  lastError?: { message: string }
  phase: string
  preflight?: { provisionStatus: string }
  updatedAt?: string
}

interface DriivzClientApi {
  decommissionCharger: (chargerId: string, date: string) => Promise<unknown>
  deleteCharger: (chargerId: string) => Promise<unknown>
  deleteProperty: (propertyId: string) => Promise<unknown>
  deleteSite: (siteId: string) => Promise<unknown>
  filterEvTransactions: (chargerId: string) => Promise<unknown>
  filterReservations: (chargerId: string) => Promise<unknown>
  getChargerProfile: (chargerId: string) => Promise<unknown>
  getProperty: (propertyId: string) => Promise<unknown>
  getSite: (siteId: string) => Promise<unknown>
  patchConnectorEvse: (chargerId: string, connectorId: string, payload: object) => Promise<unknown>
}

interface MockResponseSpec {
  body?: unknown
  method: string
  path: string
  status?: number
}

interface ScriptModule {
  DriivzClient: new (options: {
    baseUrl: string
    fetchImplementation: typeof fetch
  }) => DriivzClientApi
  DriivzDeletionWorkflow: new (options: WorkflowOptions) => {
    run: () => Promise<WorkflowState>
  }
  FileWorkflowStateStore: new (filePath: string) => StateStore
  Phase: Record<string, string>
}

interface StateStore {
  load: () => WorkflowState
  save: (state: WorkflowState) => void
}

interface WorkflowOptions {
  chargers: {
    connectorEvses?: { connectorId: string; payload: object }[]
    id: string
    propertyId?: string
    siteId?: string
  }[]
  client: DriivzClientApi
  now?: () => number
  pollIntervalMs?: number
  pollTimeoutMs?: number
  sleep?: (delay: number) => Promise<void>
  stateStore: StateStore
}

interface WorkflowState {
  chargers: Record<string, ChargerState>
  version?: number
}

const require = createRequire(import.meta.url)
const { DriivzClient, DriivzDeletionWorkflow, FileWorkflowStateStore, Phase } =
  require('../../src/scripts/deleteChargingStations.cjs') as ScriptModule

const BASE_URL = 'https://driivz.example'
const CHARGER = {
  connectorEvses: [{ connectorId: 'connector-1', payload: { evseId: null } }],
  id: 'charger-1',
  propertyId: 'property-1',
  siteId: 'site-1',
}

/**
 * Creates a deterministic fetch mock with an expected response sequence.
 * @param responses - Ordered HTTP responses and request expectations.
 * @returns The mock implementation and recorded calls.
 */
function createFetchMock (responses: MockResponseSpec[]): {
  calls: { body?: unknown; method: string; path: string }[]
  fetchImplementation: typeof fetch
} {
  const calls: { body?: unknown; method: string; path: string }[] = []
  const fetchImplementation = ((input: Request | string | URL, init?: RequestInit) => {
    const response = responses.shift()
    const inputUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    assert.notStrictEqual(response, undefined, `Unexpected request: ${inputUrl}`)
    const url = new URL(inputUrl)
    const method = init?.method ?? 'GET'
    const body: unknown =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    calls.push({ body, method, path: url.pathname })
    assert.strictEqual(method, response?.method)
    assert.strictEqual(url.pathname, response?.path)
    const status = response?.status ?? 200
    return Promise.resolve(
      new Response(response?.body == null ? undefined : JSON.stringify(response.body), {
        headers: { 'Content-Type': 'application/json' },
        status,
      })
    )
  }) as typeof fetch
  return { calls, fetchImplementation }
}

await describe('DriivzDeletionWorkflow', async () => {
  let temporaryDirectory: string
  let stateFile: string

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'driivz-deletion-test-'))
    stateFile = join(temporaryDirectory, 'state.json')
  })

  afterEach(() => {
    standardCleanup()
    rmSync(temporaryDirectory, { force: true, recursive: true })
  })

  await it('should persist a barrier between decommission and deletion', async () => {
    const { calls, fetchImplementation } = createFetchMock([
      {
        body: { provisionStatus: 'ACTIVE' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
      { body: { items: [] }, method: 'POST', path: '/v1/ev-transactions/filter' },
      { body: { items: [] }, method: 'POST', path: '/v1/reservations/filter' },
      {
        body: {},
        method: 'PATCH',
        path: '/v1/chargers/charger-1/status/actions/decommission',
      },
    ])
    const workflow = createWorkflow(fetchImplementation)

    const state = await workflow.run()

    assert.deepStrictEqual(
      calls.map(({ method, path }) => `${method} ${path}`),
      [
        'GET /v1/chargers/charger-1/profile',
        'POST /v1/ev-transactions/filter',
        'POST /v1/reservations/filter',
        'PATCH /v1/chargers/charger-1/status/actions/decommission',
      ]
    )
    assert.deepStrictEqual(calls[1].body, { chargerIds: ['charger-1'] })
    assert.deepStrictEqual(calls[2].body, { chargerIds: ['charger-1'] })
    assert.deepStrictEqual(calls[3].body, {
      allowPastDate: true,
      date: '2026-08-07T15:11:14.278Z',
    })
    assert.strictEqual(state.chargers['charger-1'].phase, Phase.POLL_DECOMMISSION)
  })

  await it('should leave deletion pending when decommission polling times out', async () => {
    writePollingState()
    let clock = 0
    const { calls, fetchImplementation } = createFetchMock([
      {
        body: { provisionStatus: 'DECOMMISSIONING' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
      {
        body: { provisionStatus: 'DECOMMISSIONING' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
    ])
    const workflow = createWorkflow(fetchImplementation, {
      now: () => clock,
      pollIntervalMs: 10,
      pollTimeoutMs: 10,
      sleep: delay => {
        clock += delay
        return Promise.resolve()
      },
    })

    const state = await workflow.run()

    assert.strictEqual(state.chargers['charger-1'].phase, Phase.POLL_DECOMMISSION)
    assert.match(state.chargers['charger-1'].lastError?.message ?? '', /Timed out/)
    assert.strictEqual(
      calls.some(({ method }) => method === 'DELETE'),
      false
    )
  })

  await it('should retry polling after an API error without repeating decommission', async () => {
    writePollingState()
    const failedRun = createFetchMock([
      {
        body: { message: 'temporary failure' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
        status: 503,
      },
    ])

    const failedState = await createWorkflow(failedRun.fetchImplementation).run()

    assert.strictEqual(failedState.chargers['charger-1'].phase, Phase.POLL_DECOMMISSION)
    assert.match(failedState.chargers['charger-1'].lastError?.message ?? '', /status 503/)

    const retryRun = createFetchMock(completionResponses())
    const completedState = await createWorkflow(retryRun.fetchImplementation).run()

    assert.strictEqual(completedState.chargers['charger-1'].phase, Phase.COMPLETE)
    assert.strictEqual(
      retryRun.calls.some(({ path }) => path.endsWith('/actions/decommission')),
      false
    )
  })

  await it('should resume from persisted state after process restart', async () => {
    const firstRun = createFetchMock([
      {
        body: { provisionStatus: 'ACTIVE' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
      { body: { total: 0 }, method: 'POST', path: '/v1/ev-transactions/filter' },
      { body: { total: 0 }, method: 'POST', path: '/v1/reservations/filter' },
      { body: {}, method: 'PATCH', path: '/v1/chargers/charger-1/status/actions/decommission' },
    ])
    await createWorkflow(firstRun.fetchImplementation).run()

    const secondRun = createFetchMock(completionResponses())
    const state = await createWorkflow(secondRun.fetchImplementation).run()

    assert.strictEqual(state.chargers['charger-1'].phase, Phase.COMPLETE)
    assert.strictEqual(secondRun.calls[0].path, '/v1/chargers/charger-1/profile')
    assert.strictEqual(
      secondRun.calls.some(({ path }) => path === '/v1/ev-transactions/filter'),
      false
    )
    const persistedState = JSON.parse(readFileSync(stateFile, 'utf8')) as WorkflowState
    assert.strictEqual(persistedState.chargers['charger-1'].phase, Phase.COMPLETE)
  })

  await it('should reconcile an accepted decommission after a crash before phase persistence', async () => {
    writeState(Phase.DECOMMISSION, {
      decommissionAttemptedAt: '2026-08-07T15:11:14.278Z',
      preflight: { provisionStatus: 'ACTIVE' },
    })
    const { calls, fetchImplementation } = createFetchMock([
      {
        body: { provisionStatus: 'DECOMMISSIONING' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
    ])

    const state = await createWorkflow(fetchImplementation).run()

    assert.strictEqual(state.chargers['charger-1'].phase, Phase.POLL_DECOMMISSION)
    assert.deepStrictEqual(
      calls.map(({ method }) => method),
      ['GET']
    )
  })

  await it('should reconcile before retrying decommission and reuse the persisted timestamp', async () => {
    writeState(Phase.DECOMMISSION, {
      decommissionAttemptedAt: '2026-08-07T15:11:14.278Z',
      preflight: { provisionStatus: 'ACTIVE' },
    })
    let clock = 0
    const { calls, fetchImplementation } = createFetchMock([
      {
        body: { provisionStatus: 'ACTIVE' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
      {
        body: { provisionStatus: 'ACTIVE' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
      { body: {}, method: 'PATCH', path: '/v1/chargers/charger-1/status/actions/decommission' },
    ])

    const state = await createWorkflow(fetchImplementation, {
      now: () => clock,
      pollIntervalMs: 10,
      pollTimeoutMs: 10,
      sleep: delay => {
        clock += delay
        return Promise.resolve()
      },
    }).run()

    assert.strictEqual(state.chargers['charger-1'].phase, Phase.POLL_DECOMMISSION)
    assert.deepStrictEqual(
      calls.map(({ method }) => method),
      ['GET', 'GET', 'PATCH']
    )
    assert.deepStrictEqual(calls[2].body, {
      allowPastDate: true,
      date: '2026-08-07T15:11:14.278Z',
    })
  })

  await it('should keep the workflow pending when a profile is absent before charger deletion', async () => {
    for (const phase of [Phase.PREFLIGHT, Phase.POLL_DECOMMISSION]) {
      writeState(phase)
      const { calls, fetchImplementation } = createFetchMock([
        { body: {}, method: 'GET', path: '/v1/chargers/charger-1/profile', status: 404 },
      ])

      const state = await createWorkflow(fetchImplementation).run()

      assert.strictEqual(state.chargers['charger-1'].phase, phase)
      assert.match(state.chargers['charger-1'].lastError?.message ?? '', /profile is absent/)
      assert.strictEqual(
        calls.some(({ method }) => method === 'DELETE'),
        false
      )
    }
  })

  await it('should retain a non-empty site and not read or delete its property', async () => {
    writeState(Phase.CLEAN_SITE)
    const { calls, fetchImplementation } = createFetchMock([
      { body: { chargerIds: ['shared-charger'] }, method: 'GET', path: '/v1/sites/site-1' },
    ])

    const state = await createWorkflow(fetchImplementation).run()

    assert.strictEqual(state.chargers['charger-1'].phase, Phase.COMPLETE)
    assert.deepStrictEqual(
      calls.map(({ method, path }) => `${method} ${path}`),
      ['GET /v1/sites/site-1']
    )
  })

  await it('should retain shared and ambiguously shared properties', async () => {
    for (const property of [{ isShared: true, siteIds: [] }, { siteIds: [] }]) {
      writeState(Phase.CLEAN_PROPERTY)
      const { calls, fetchImplementation } = createFetchMock([
        { body: property, method: 'GET', path: '/v1/properties/property-1' },
      ])

      const state = await createWorkflow(fetchImplementation).run()

      assert.strictEqual(state.chargers['charger-1'].phase, Phase.COMPLETE)
      assert.strictEqual(
        calls.some(({ method }) => method === 'DELETE'),
        false
      )
    }
  })

  /**
   * Builds the successful response sequence after decommissioning.
   * @returns Ordered API responses through parent deletion.
   */
  function completionResponses (): MockResponseSpec[] {
    return [
      {
        body: { provisionStatus: 'DECOMMISSIONED' },
        method: 'GET',
        path: '/v1/chargers/charger-1/profile',
      },
      { body: {}, method: 'PATCH', path: '/v1/chargers/charger-1/connectors/connector-1/evse' },
      { body: {}, method: 'DELETE', path: '/v1/chargers/charger-1' },
      { body: {}, method: 'GET', path: '/v1/chargers/charger-1/profile', status: 404 },
      { body: { chargerIds: [] }, method: 'GET', path: '/v1/sites/site-1' },
      { body: {}, method: 'DELETE', path: '/v1/sites/site-1' },
      { body: {}, method: 'GET', path: '/v1/sites/site-1', status: 404 },
      { body: { isShared: false, siteIds: [] }, method: 'GET', path: '/v1/properties/property-1' },
      { body: {}, method: 'DELETE', path: '/v1/properties/property-1' },
      { body: {}, method: 'GET', path: '/v1/properties/property-1', status: 404 },
    ]
  }

  /**
   * Creates a workflow backed by the current test state file.
   * @param fetchImplementation - Fetch mock for this run.
   * @param overrides - Optional workflow timing overrides.
   * @returns A configured deletion workflow.
   */
  function createWorkflow (
    fetchImplementation: typeof fetch,
    overrides: Partial<WorkflowOptions> = {}
  ): { run: () => Promise<WorkflowState> } {
    return new DriivzDeletionWorkflow({
      chargers: [CHARGER],
      client: new DriivzClient({ baseUrl: BASE_URL, fetchImplementation }),
      now: () => Date.parse('2026-08-07T15:11:14.278Z'),
      pollIntervalMs: 1,
      pollTimeoutMs: 10,
      sleep: () => Promise.resolve(),
      stateStore: new FileWorkflowStateStore(stateFile),
      ...overrides,
    })
  }

  /**
   * Persists a workflow waiting for decommission completion.
   */
  function writePollingState (): void {
    writeState(Phase.POLL_DECOMMISSION)
  }

  /**
   * Persists a workflow at a selected phase.
   * @param phase - Phase to resume from.
   * @param stateOverrides - Additional persisted charger state.
   */
  function writeState (phase: string, stateOverrides: Partial<ChargerState> = {}): void {
    new FileWorkflowStateStore(stateFile).save({
      chargers: {
        'charger-1': {
          attempts: 1,
          charger: CHARGER,
          phase,
          updatedAt: '2026-08-07T15:11:14.278Z',
          ...stateOverrides,
        },
      },
      version: 1,
    })
  }
})
