/**
 * @file useAddStationsForm.test.ts
 * @description Tests for the useAddStationsForm shared composable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const mockAddChargingStations = vi.fn().mockResolvedValue({ status: 'success' })
const mockExecuteAction = vi.fn(
  (
    _action: Promise<unknown>,
    _successMsg: string,
    _errorMsg: string,
    callbacks?: { onFinally?: () => void }
  ) => {
    callbacks?.onFinally?.()
  }
)
const mockTemplates = ref(['template1.json', 'template2.json'])

vi.mock('@/composables/Utils.js', () => ({
  resetToggleButtonState: vi.fn(),
  useExecuteAction: () => mockExecuteAction,
  useTemplates: () => mockTemplates,
  useUIClient: () => ({
    addChargingStations: mockAddChargingStations,
  }),
}))

let uuidCounter = 0

vi.mock('ui-common', () => ({
  convertToBoolean: (v: unknown) => Boolean(v),
  randomUUID: () => `uuid-${String(++uuidCounter)}`,
}))

import { useAddStationsForm } from '@/shared/composables/useAddStationsForm.js'

describe('useAddStationsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const { formState } = useAddStationsForm()
    expect(formState.value.template).toBe('')
    expect(formState.value.numberOfStations).toBe(1)
    expect(formState.value.autoStart).toBe(false)
    expect(formState.value.ocppStrictCompliance).toBe(true)
    expect(formState.value.persistentConfiguration).toBe(true)
    expect(formState.value.baseName).toBe('')
    expect(formState.value.enableStatistics).toBe(false)
    expect(formState.value.fixedName).toBe(false)
    expect(formState.value.supervisionUrl).toBe('')
    expect(formState.value.supervisionUser).toBe('')
    expect(formState.value.supervisionPassword).toBe('')
  })

  it('returns templates from injection', () => {
    const { templates } = useAddStationsForm()
    expect(templates.value).toEqual(['template1.json', 'template2.json'])
  })

  it('resetForm restores default state', () => {
    const { formState, resetForm } = useAddStationsForm()
    formState.value.template = 'test.json'
    formState.value.numberOfStations = 5
    formState.value.autoStart = true
    resetForm()
    expect(formState.value.template).toBe('')
    expect(formState.value.numberOfStations).toBe(1)
    expect(formState.value.autoStart).toBe(false)
  })

  it('submitForm calls executeAction with addChargingStations', () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'station-template.json'
    formState.value.numberOfStations = 3
    submitForm()
    expect(mockAddChargingStations).toHaveBeenCalledWith('station-template.json', 3, {
      autoStart: false,
      baseName: undefined,
      enableStatistics: false,
      fixedName: undefined,
      ocppStrictCompliance: true,
      persistentConfiguration: true,
      supervisionPassword: undefined,
      supervisionUrls: undefined,
      supervisionUser: undefined,
    })
    expect(mockExecuteAction).toHaveBeenCalled()
  })

  it('submitForm passes optional fields when set', () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'tpl.json'
    formState.value.numberOfStations = 1
    formState.value.baseName = 'CS-'
    formState.value.fixedName = true
    formState.value.supervisionUrl = 'ws://localhost:8080'
    formState.value.supervisionUser = 'admin'
    formState.value.supervisionPassword = 'secret'
    submitForm()
    expect(mockAddChargingStations).toHaveBeenCalledWith('tpl.json', 1, {
      autoStart: false,
      baseName: 'CS-',
      enableStatistics: false,
      fixedName: true,
      ocppStrictCompliance: true,
      persistentConfiguration: true,
      supervisionPassword: 'secret',
      supervisionUrls: 'ws://localhost:8080',
      supervisionUser: 'admin',
    })
  })

  it('updates renderTemplates when templates change', async () => {
    const { formState } = useAddStationsForm()
    const before = formState.value.renderTemplates
    mockTemplates.value = ['new-template.json']
    await nextTick()
    expect(formState.value.renderTemplates).not.toBe(before)
  })

  it('submitForm resets form via onFinally callback', () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'station.json'
    formState.value.numberOfStations = 5
    submitForm()
    expect(formState.value.template).toBe('')
    expect(formState.value.numberOfStations).toBe(1)
  })
})
