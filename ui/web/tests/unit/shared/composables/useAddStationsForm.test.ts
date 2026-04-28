/**
 * @file useAddStationsForm.test.ts
 * @description Tests for the useAddStationsForm shared composable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
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

  it('should return templates from injection', () => {
    const { templates } = useAddStationsForm()
    expect(templates.value).toEqual(['template1.json', 'template2.json'])
    expect(templates.value.length).toBe(2)
  })

  it('should reset form to default state', () => {
    const { formState, resetForm } = useAddStationsForm()
    formState.value.template = 'test.json'
    formState.value.numberOfStations = 5
    formState.value.autoStart = true
    resetForm()
    expect(formState.value.template).toBe('')
    expect(formState.value.numberOfStations).toBe(1)
    expect(formState.value.autoStart).toBe(false)
  })

  it('should call executeAction with addChargingStations on submit', () => {
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

  it('should pass optional fields when set on submit', () => {
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

  it('should update renderTemplates when templates change', async () => {
    const { formState } = useAddStationsForm()
    const before = formState.value.renderTemplates
    mockTemplates.value = ['new-template.json']
    await nextTick()
    expect(formState.value.renderTemplates).not.toBe(before)
    expect(typeof formState.value.renderTemplates).toBe('string')
  })

  it('should reset form via onFinally callback on submit', () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'station.json'
    formState.value.numberOfStations = 5
    submitForm()
    expect(formState.value.template).toBe('')
    expect(formState.value.numberOfStations).toBe(1)
  })

  it('should invoke user-provided onFinally callback on submit', () => {
    const onFinally = vi.fn()
    const { formState, submitForm } = useAddStationsForm({ onFinally })
    formState.value.template = 'tpl.json'
    formState.value.numberOfStations = 2
    submitForm()
    expect(onFinally).toHaveBeenCalledTimes(1)
    expect(mockExecuteAction).toHaveBeenCalled()
  })

  it('should call executeAction with numberOfStations = 0', () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'boundary.json'
    formState.value.numberOfStations = 0
    submitForm()
    expect(mockAddChargingStations).toHaveBeenCalledWith('boundary.json', 0, expect.any(Object))
    expect(mockExecuteAction).toHaveBeenCalled()
  })

  it('should update renderTemplates reactively when templates ref changes', async () => {
    const { formState } = useAddStationsForm()
    const initial = formState.value.renderTemplates
    mockTemplates.value = ['alpha.json', 'beta.json', 'gamma.json']
    await nextTick()
    const updated = formState.value.renderTemplates
    expect(updated).not.toBe(initial)
    mockTemplates.value = ['delta.json']
    await nextTick()
    expect(formState.value.renderTemplates).not.toBe(updated)
  })
})
