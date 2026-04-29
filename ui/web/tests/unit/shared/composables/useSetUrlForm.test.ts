/**
 * @file Tests for useSetUrlForm composable
 * @description Tests for the useSetUrlForm shared composable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toastMock } from '../../../setup.js'

const mockSetSupervisionUrl = vi.fn().mockResolvedValue({ status: 'success' })

vi.mock('@/composables/Utils.js', () => ({
  useUIClient: () => ({
    setSupervisionUrl: mockSetSupervisionUrl,
  }),
}))

import { useSetUrlForm } from '@/shared/composables/useSetUrlForm.js'

describe('useSetUrlForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with empty form state', () => {
    const { formState } = useSetUrlForm('hash1', 'CS-001')
    expect(formState.value.supervisionUrl).toBe('')
    expect(formState.value.supervisionUser).toBe('')
    expect(formState.value.supervisionPassword).toBe('')
  })

  it('should return chargingStationId from arguments', () => {
    const { chargingStationId } = useSetUrlForm('hash1', 'CS-001')
    expect(chargingStationId).toBe('CS-001')
  })

  it('should reset form to empty state', () => {
    const { formState, resetForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://example.com'
    formState.value.supervisionUser = 'user'
    formState.value.supervisionPassword = 'pass'
    resetForm()
    expect(formState.value.supervisionUrl).toBe('')
    expect(formState.value.supervisionUser).toBe('')
    expect(formState.value.supervisionPassword).toBe('')
  })

  it('should show error when supervisionUrl is empty on submit', async () => {
    const { submitForm } = useSetUrlForm('hash1', 'CS-001')
    await submitForm()
    expect(toastMock.error).toHaveBeenCalledWith('Supervision url is required')
    expect(mockSetSupervisionUrl).not.toHaveBeenCalled()
  })

  it('should call setSupervisionUrl when url is set', async () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://server:8080'
    await submitForm()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith('hash1', 'ws://server:8080', '', '')
    expect(toastMock.success).toHaveBeenCalledWith('Supervision url successfully set')
  })

  it('should pass optional user and password when set on submit', async () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUser = 'admin'
    formState.value.supervisionPassword = 'secret'
    await submitForm()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith(
      'hash1',
      'ws://server:8080',
      'admin',
      'secret'
    )
  })

  it('should not show toast error when url is valid', async () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://valid-server:9090'
    await submitForm()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith('hash1', 'ws://valid-server:9090', '', '')
  })
})
