/**
 * @file Tests for useAddStationsForm composable
 * @description Tests for the useAddStationsForm shared composable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { toastMock } from '../../../setup.js'

const mockAddChargingStations = vi.fn().mockResolvedValue({ status: 'success' })
const mockTemplates = ref(['template1.json', 'template2.json'])

vi.mock('@/composables/Utils.js', () => ({
  resetToggleButtonState: vi.fn(),
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
    mockTemplates.value = ['template1.json', 'template2.json']
    uuidCounter = 0
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

  it('should reflect injected templates reactively', () => {
    const { templates } = useAddStationsForm()
    expect(templates.value).toEqual(['template1.json', 'template2.json'])
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

  it('should call addChargingStations on submit', async () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'station-template.json'
    formState.value.numberOfStations = 3
    await submitForm()
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
    expect(toastMock.success).toHaveBeenCalledWith('Charging stations successfully added')
  })

  it('should pass optional fields when set on submit', async () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'tpl.json'
    formState.value.numberOfStations = 1
    formState.value.baseName = 'CS-'
    formState.value.fixedName = true
    formState.value.supervisionUrl = 'ws://localhost:8080'
    formState.value.supervisionUser = 'admin'
    formState.value.supervisionPassword = 'secret'
    await submitForm()
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

  it('should reset form after submit', async () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'station.json'
    formState.value.numberOfStations = 5
    await submitForm()
    expect(formState.value.template).toBe('')
    expect(formState.value.numberOfStations).toBe(1)
  })

  it('should invoke user-provided onFinally callback on submit', async () => {
    const onFinally = vi.fn()
    const { formState, submitForm } = useAddStationsForm({ onFinally })
    formState.value.template = 'tpl.json'
    formState.value.numberOfStations = 2
    await submitForm()
    expect(onFinally).toHaveBeenCalledTimes(1)
  })

  it('should call addChargingStations with numberOfStations = 0', async () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'boundary.json'
    formState.value.numberOfStations = 0
    await submitForm()
    expect(mockAddChargingStations).toHaveBeenCalledWith('boundary.json', 0, expect.any(Object))
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

  it('should show error toast on failure', async () => {
    mockAddChargingStations.mockRejectedValueOnce(new Error('network error'))
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'tpl.json'
    const result = await submitForm()
    expect(result).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('Error at adding charging stations')
  })

  it('should expose pending state', () => {
    const { pending } = useAddStationsForm()
    expect(pending.value).toBe(false)
  })

  it('should show toast error and return false when template is empty', async () => {
    const { submitForm } = useAddStationsForm()
    const result = await submitForm()
    expect(result).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('Please select a template')
  })

  it('should return false and not call addChargingStations when pending', async () => {
    const { formState, submitForm } = useAddStationsForm()
    formState.value.template = 'tpl.json'
    let resolveFirst!: (value: { status: string }) => void
    mockAddChargingStations.mockImplementationOnce(
      () =>
        new Promise<{ status: string }>(resolve => {
          resolveFirst = resolve
        })
    )
    const firstCall = submitForm()
    const secondResult = await submitForm()
    expect(secondResult).toBe(false)
    expect(mockAddChargingStations).toHaveBeenCalledTimes(1)
    resolveFirst({ status: 'success' })
    await firstCall
  })
})
