/**
 * @file Tests for useChangeConfigurationForm composable
 * @description Tests for the shared per-key OCPP configuration edit composable.
 */
import type { ConfigurationKey } from 'ui-common'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { toastMock } from '../../../setup.js'

const mockChangeConfiguration = vi.fn().mockResolvedValue({ status: 'success' })

vi.mock('@/core/index.js', () => ({
  useUIClient: () => ({
    changeConfiguration: mockChangeConfiguration,
  }),
}))
import { useChangeConfigurationForm } from '@/shared/composables/useChangeConfigurationForm.js'

const writableKey: ConfigurationKey = {
  key: 'MeterValueSampleInterval',
  readonly: false,
  value: '60',
}
const readonlyKey: ConfigurationKey = {
  key: 'SupportedFeatureProfiles',
  readonly: true,
  value: 'Core',
}
const rebootKey: ConfigurationKey = {
  key: 'AuthorizationKey',
  readonly: false,
  reboot: true,
  value: 'abc',
}

describe('useChangeConfigurationForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockChangeConfiguration.mockResolvedValue({ status: 'success' })
  })

  it('should submit a writable key and toast success', async () => {
    const { submit } = useChangeConfigurationForm('hash1')
    const result = await submit(writableKey, '30')
    expect(result).toBe(true)
    expect(mockChangeConfiguration).toHaveBeenCalledWith('hash1', 'MeterValueSampleInterval', '30')
    expect(toastMock.success).toHaveBeenCalledWith(
      "Configuration key 'MeterValueSampleInterval' successfully set"
    )
  })

  it('should surface a reboot-required notice for a reboot key', async () => {
    const { submit } = useChangeConfigurationForm('hash1')
    await submit(rebootKey, 'xyz')
    expect(toastMock.success).toHaveBeenCalledWith(
      "Configuration key 'AuthorizationKey' set, reboot required to take effect"
    )
  })

  it('should never submit a readonly key', async () => {
    const { submit } = useChangeConfigurationForm('hash1')
    const result = await submit(readonlyKey, 'Core,FirmwareManagement')
    expect(result).toBe(false)
    expect(mockChangeConfiguration).not.toHaveBeenCalled()
  })

  it('should return false and toast error when the change is rejected', async () => {
    mockChangeConfiguration.mockRejectedValueOnce(new Error('rejected'))
    const { submit } = useChangeConfigurationForm('hash1')
    const result = await submit(writableKey, '30')
    expect(result).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith(
      "Error at setting configuration key 'MeterValueSampleInterval'"
    )
  })

  it('should short-circuit a concurrent submit for the same key', async () => {
    let resolveChange: ((value: { status: string }) => void) | undefined
    mockChangeConfiguration.mockReturnValueOnce(
      new Promise<{ status: string }>(resolve => {
        resolveChange = resolve
      })
    )
    const { pending, submit } = useChangeConfigurationForm('hash1')

    const first = submit(writableKey, '30')
    expect(pending.has('MeterValueSampleInterval')).toBe(true)
    const second = await submit(writableKey, '45')
    expect(second).toBe(false)
    expect(mockChangeConfiguration).toHaveBeenCalledTimes(1)

    resolveChange?.({ status: 'success' })
    await first
    expect(pending.has('MeterValueSampleInterval')).toBe(false)
  })
})
