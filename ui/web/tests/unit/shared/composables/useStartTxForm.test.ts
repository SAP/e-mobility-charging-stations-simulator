/**
 * @file useStartTxForm.test.ts
 * @description Tests for the useStartTxForm shared composable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthorize = vi.fn().mockResolvedValue({ status: 'success' })
const mockStartTransaction = vi.fn().mockResolvedValue({ status: 'success' })
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()

vi.mock('@/composables/Utils.js', () => ({
  resetToggleButtonState: vi.fn(),
  useUIClient: () => ({
    authorize: mockAuthorize,
    startTransaction: mockStartTransaction,
  }),
}))

vi.mock('vue-toast-notification', () => ({
  useToast: () => ({
    error: mockToastError,
    success: mockToastSuccess,
  }),
}))

vi.mock('ui-common', () => ({
  convertToInt: (v: string) => Number.parseInt(v, 10),
  OCPPVersion: { VERSION_16: '1.6', VERSION_20: '2.0', VERSION_201: '2.0.1' },
}))

import { OCPPVersion } from 'ui-common'

import { useStartTxForm } from '@/shared/composables/useStartTxForm.js'

describe('useStartTxForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const { formState } = useStartTxForm('hash1', '1')
    expect(formState.value.idTag).toBe('')
    expect(formState.value.authorizeIdTag).toBe(false)
  })

  it('resetForm restores defaults', () => {
    const { formState, resetForm } = useStartTxForm('hash1', '1')
    formState.value.idTag = 'TAG001'
    formState.value.authorizeIdTag = true
    resetForm()
    expect(formState.value.idTag).toBe('')
    expect(formState.value.authorizeIdTag).toBe(false)
  })

  it('submitForm calls startTransaction with correct params', async () => {
    const { formState, submitForm } = useStartTxForm('hash1', '2', 1, OCPPVersion.VERSION_16)
    formState.value.idTag = 'TAG001'
    await submitForm()
    expect(mockStartTransaction).toHaveBeenCalledWith('hash1', {
      connectorId: 2,
      evseId: 1,
      idTag: 'TAG001',
      ocppVersion: OCPPVersion.VERSION_16,
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Transaction successfully started')
  })

  it('submitForm passes undefined idTag when empty', async () => {
    const { submitForm } = useStartTxForm('hash1', '1')
    await submitForm()
    expect(mockStartTransaction).toHaveBeenCalledWith('hash1', {
      connectorId: 1,
      evseId: undefined,
      idTag: undefined,
      ocppVersion: undefined,
    })
  })

  it('submitForm authorizes first when authorizeIdTag is true', async () => {
    const { formState, submitForm } = useStartTxForm('hash1', '1')
    formState.value.authorizeIdTag = true
    formState.value.idTag = 'TAG001'
    await submitForm()
    expect(mockAuthorize).toHaveBeenCalledWith('hash1', 'TAG001')
    expect(mockStartTransaction).toHaveBeenCalled()
  })

  it('submitForm shows error when authorizeIdTag is true but idTag is empty', async () => {
    const { formState, submitForm } = useStartTxForm('hash1', '1')
    formState.value.authorizeIdTag = true
    formState.value.idTag = ''
    await submitForm()
    expect(mockToastError).toHaveBeenCalledWith('Please provide an RFID tag to authorize')
    expect(mockStartTransaction).not.toHaveBeenCalled()
  })

  it('submitForm handles authorize failure', async () => {
    mockAuthorize.mockRejectedValueOnce(new Error('auth failed'))
    const { formState, submitForm } = useStartTxForm('hash1', '1')
    formState.value.authorizeIdTag = true
    formState.value.idTag = 'TAG001'
    await submitForm()
    expect(mockToastError).toHaveBeenCalledWith('Error at authorizing RFID tag')
    expect(mockStartTransaction).not.toHaveBeenCalled()
  })

  it('submitForm handles startTransaction failure', async () => {
    mockStartTransaction.mockRejectedValueOnce(new Error('tx failed'))
    const { formState, submitForm } = useStartTxForm('hash1', '1')
    formState.value.idTag = 'TAG001'
    await submitForm()
    expect(mockToastError).toHaveBeenCalledWith('Error at starting transaction')
  })
})
