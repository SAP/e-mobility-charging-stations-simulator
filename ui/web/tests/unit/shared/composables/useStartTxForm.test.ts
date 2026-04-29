/**
 * @file useStartTxForm.test.ts
 * @description Tests for the useStartTxForm shared composable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockAuthorize = vi.fn().mockResolvedValue({ status: 'success' })
const mockStartTransaction = vi.fn().mockResolvedValue({ status: 'success' })
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()

vi.mock('@/composables/Utils.js', () => ({
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
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const { formState } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    expect(formState.value.idTag).toBe('')
    expect(formState.value.authorizeIdTag).toBe(true)
  })

  it('should reset form to defaults', () => {
    const { formState, resetForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.idTag = 'TAG001'
    formState.value.authorizeIdTag = false
    resetForm()
    expect(formState.value.idTag).toBe('')
    expect(formState.value.authorizeIdTag).toBe(true)
  })

  it('should call startTransaction with correct params on submit', async () => {
    const { formState, submitForm } = useStartTxForm({
      connectorId: '2',
      evseId: 1,
      hashId: 'hash1',
      ocppVersion: OCPPVersion.VERSION_16,
    })
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

  it('should pass undefined idTag when empty on submit', async () => {
    const { formState, submitForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.authorizeIdTag = false
    await submitForm()
    expect(mockStartTransaction).toHaveBeenCalledWith('hash1', {
      connectorId: 1,
      evseId: undefined,
      idTag: undefined,
      ocppVersion: undefined,
    })
  })

  it('should authorize first when authorizeIdTag is true', async () => {
    const { formState, submitForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.authorizeIdTag = true
    formState.value.idTag = 'TAG001'
    await submitForm()
    expect(mockAuthorize).toHaveBeenCalledWith('hash1', 'TAG001')
    expect(mockStartTransaction).toHaveBeenCalled()
  })

  it('should show error when authorizeIdTag is true but idTag is empty', async () => {
    const { formState, submitForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.authorizeIdTag = true
    formState.value.idTag = ''
    await submitForm()
    expect(mockToastError).toHaveBeenCalledWith('Please provide an RFID tag to authorize')
    expect(mockStartTransaction).not.toHaveBeenCalled()
  })

  it('should handle authorize failure', async () => {
    mockAuthorize.mockRejectedValueOnce(new Error('auth failed'))
    const { formState, submitForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.authorizeIdTag = true
    formState.value.idTag = 'TAG001'
    const result = await submitForm()
    expect(result).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith('Error at authorizing RFID tag')
    expect(mockStartTransaction).not.toHaveBeenCalled()
  })

  it('should handle startTransaction failure', async () => {
    mockStartTransaction.mockRejectedValueOnce(new Error('tx failed'))
    const { formState, submitForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.idTag = 'TAG001'
    const result = await submitForm()
    expect(result).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith('Error at starting transaction')
  })

  it('should call onCleanup on authorize failure', async () => {
    mockAuthorize.mockRejectedValueOnce(new Error('auth failed'))
    const onCleanup = vi.fn()
    const { formState, submitForm } = useStartTxForm({
      connectorId: '1',
      hashId: 'hash1',
      options: { onCleanup },
    })
    formState.value.authorizeIdTag = true
    formState.value.idTag = 'TAG001'
    const result = await submitForm()
    expect(result).toBe(false)
    expect(onCleanup).toHaveBeenCalledOnce()
  })

  it('should call onCleanup in finally block on successful transaction', async () => {
    const onCleanup = vi.fn()
    const { formState, submitForm } = useStartTxForm({
      connectorId: '1',
      hashId: 'hash1',
      options: { onCleanup },
    })
    formState.value.authorizeIdTag = false
    await submitForm()
    expect(onCleanup).toHaveBeenCalledOnce()
  })

  it('should call onCleanup in finally block on transaction failure', async () => {
    mockStartTransaction.mockRejectedValueOnce(new Error('tx failed'))
    const onCleanup = vi.fn()
    const { formState, submitForm } = useStartTxForm({
      connectorId: '1',
      hashId: 'hash1',
      options: { onCleanup },
    })
    formState.value.authorizeIdTag = false
    const result = await submitForm()
    expect(result).toBe(false)
    expect(onCleanup).toHaveBeenCalledOnce()
  })

  it('should work without onCleanup option', async () => {
    const { formState, submitForm } = useStartTxForm({ connectorId: '1', hashId: 'hash1' })
    formState.value.authorizeIdTag = false
    const result = await submitForm()
    expect(result).toBe(true)
  })
})
