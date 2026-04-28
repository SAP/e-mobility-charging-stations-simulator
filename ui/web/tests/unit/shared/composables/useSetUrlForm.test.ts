/**
 * @file useSetUrlForm.test.ts
 * @description Tests for the useSetUrlForm shared composable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSetSupervisionUrl = vi.fn().mockResolvedValue({ status: 'success' })
const mockExecuteAction = vi.fn()
const mockToastError = vi.fn()

vi.mock('@/composables/Utils.js', () => ({
  useExecuteAction: () => mockExecuteAction,
  useUIClient: () => ({
    setSupervisionUrl: mockSetSupervisionUrl,
  }),
}))

vi.mock('vue-toast-notification', () => ({
  useToast: () => ({
    error: mockToastError,
    success: vi.fn(),
  }),
}))

import { useSetUrlForm } from '@/shared/composables/useSetUrlForm.js'

describe('useSetUrlForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with empty form state', () => {
    const { formState } = useSetUrlForm('hash1', 'CS-001')
    expect(formState.value.supervisionUrl).toBe('')
    expect(formState.value.supervisionUser).toBe('')
    expect(formState.value.supervisionPassword).toBe('')
  })

  it('returns chargingStationId', () => {
    const { chargingStationId } = useSetUrlForm('hash1', 'CS-001')
    expect(chargingStationId).toBe('CS-001')
    expect(typeof chargingStationId).toBe('string')
  })

  it('resetForm restores empty state', () => {
    const { formState, resetForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://example.com'
    formState.value.supervisionUser = 'user'
    formState.value.supervisionPassword = 'pass'
    resetForm()
    expect(formState.value.supervisionUrl).toBe('')
    expect(formState.value.supervisionUser).toBe('')
    expect(formState.value.supervisionPassword).toBe('')
  })

  it('submitForm shows error when supervisionUrl is empty', () => {
    const { submitForm } = useSetUrlForm('hash1', 'CS-001')
    submitForm()
    expect(mockToastError).toHaveBeenCalledWith('Supervision url is required')
    expect(mockExecuteAction).not.toHaveBeenCalled()
  })

  it('submitForm calls executeAction with setSupervisionUrl when url is set', () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://server:8080'
    submitForm()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith(
      'hash1',
      'ws://server:8080',
      undefined,
      undefined
    )
    expect(mockExecuteAction).toHaveBeenCalled()
  })

  it('submitForm passes optional user and password when set', () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUser = 'admin'
    formState.value.supervisionPassword = 'secret'
    submitForm()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith(
      'hash1',
      'ws://server:8080',
      'admin',
      'secret'
    )
  })

  it('submitForm shows error when url is cleared after being set', () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUrl = ''
    submitForm()
    expect(mockToastError).toHaveBeenCalledWith('Supervision url is required')
    expect(mockSetSupervisionUrl).not.toHaveBeenCalled()
  })

  it('submitForm does not show toast error when url is valid', () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://valid-server:9090'
    submitForm()
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith(
      'hash1',
      'ws://valid-server:9090',
      undefined,
      undefined
    )
  })
})
