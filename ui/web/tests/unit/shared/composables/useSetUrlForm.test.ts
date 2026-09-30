/**
 * @file Tests for useSetUrlForm composable
 * @description Tests for the useSetUrlForm shared composable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { toastMock } from '../../../setup.js'

const mockSetSupervisionUrl = vi.fn().mockResolvedValue({ status: 'success' })

vi.mock('@/core/index.js', () => ({
  useUIClient: () => ({
    setSupervisionUrl: mockSetSupervisionUrl,
  }),
}))

import { useSetUrlForm } from '@/shared/composables/useSetUrlForm.js'

describe('useSetUrlForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
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
    expect(await submitForm()).toBe(false)
    expect(toastMock.error).toHaveBeenCalled()
    expect(mockSetSupervisionUrl).not.toHaveBeenCalled()
  })

  it('should omit a credential left at the station base value', async () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001', {
      supervisionPassword: 'secret',
      supervisionUser: 'admin',
    })
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUser = 'admin'
    formState.value.supervisionPassword = 'secret'
    await submitForm()
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith(
      'hash1',
      'ws://server:8080',
      undefined,
      undefined
    )
  })

  it('should reject an invalid edited username without partial updates and allow correction', async () => {
    const { formState, pending, submitForm } = useSetUrlForm('hash1', 'CS-001', {
      supervisionPassword: 'secret',
      supervisionUser: 'admin',
    })
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUser = 'operator:new'
    formState.value.supervisionPassword = ''

    expect(await submitForm()).toBe(false)
    expect(mockSetSupervisionUrl).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/username/i))
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(pending.value).toBe(false)
    expect(formState.value.supervisionUser).toBe('operator:new')
    expect(formState.value.supervisionPassword).toBe('')

    formState.value.supervisionUser = 'operator'
    expect(await submitForm()).toBe(true)
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith('hash1', 'ws://server:8080', 'operator', '')
    expect(pending.value).toBe(false)
  })

  it('should reject an invalid username without base credentials and allow explicit clearing', async () => {
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUser = 'operator:new'

    expect(await submitForm()).toBe(false)
    expect(mockSetSupervisionUrl).not.toHaveBeenCalled()

    formState.value.supervisionUser = ''
    expect(await submitForm()).toBe(true)
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith('hash1', 'ws://server:8080', '', '')
  })

  it('should preserve an inherited colon username while allowing password colons', async () => {
    const baseCredentials = ref({
      supervisionPassword: 'secret',
      supervisionUser: 'dom:operator',
    })
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001', baseCredentials)
    formState.value.supervisionUrl = 'ws://server:8080'
    formState.value.supervisionUser = 'dom:operator'
    formState.value.supervisionPassword = 'secret:new'

    expect(await submitForm()).toBe(true)
    expect(mockSetSupervisionUrl).toHaveBeenCalledWith(
      'hash1',
      'ws://server:8080',
      undefined,
      'secret:new'
    )
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('should return false and show error toast when setSupervisionUrl rejects', async () => {
    mockSetSupervisionUrl.mockRejectedValueOnce(new Error('Network error'))
    const { formState, submitForm } = useSetUrlForm('hash1', 'CS-001')
    formState.value.supervisionUrl = 'wss://example.com'
    const result = await submitForm()
    expect(result).toBe(false)
    expect(toastMock.error).toHaveBeenCalled()
  })
})
