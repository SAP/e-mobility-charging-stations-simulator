/**
 * @file Tests for useChangeConfigurationForm composable
 * @description Tests for the shared per-key OCPP configuration change composable.
 */
import type { ConfigurationKey } from 'ui-common'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

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

  it('should seed draft values from the visible keys', () => {
    const keys = ref<ConfigurationKey[]>([writableKey, rebootKey])
    const { draftValues } = useChangeConfigurationForm('hash1', keys)
    expect(draftValues).toEqual({ AuthorizationKey: 'abc', MeterValueSampleInterval: '60' })
  })

  it('should submit a writable key draft and toast success', async () => {
    const keys = ref<ConfigurationKey[]>([writableKey])
    const { draftValues, save } = useChangeConfigurationForm('hash1', keys)
    draftValues.MeterValueSampleInterval = '30'
    const result = await save(writableKey)
    expect(result).toBe(true)
    expect(mockChangeConfiguration).toHaveBeenCalledWith('hash1', 'MeterValueSampleInterval', '30')
    expect(toastMock.success).toHaveBeenCalledWith(
      "Configuration key 'MeterValueSampleInterval' successfully set"
    )
  })

  it('should surface a reboot-required notice for a reboot key', async () => {
    const keys = ref<ConfigurationKey[]>([rebootKey])
    const { save } = useChangeConfigurationForm('hash1', keys)
    await save(rebootKey)
    expect(toastMock.success).toHaveBeenCalledWith(
      "Configuration key 'AuthorizationKey' set, reboot required to take effect"
    )
  })

  it('should never submit a readonly key', async () => {
    const keys = ref<ConfigurationKey[]>([readonlyKey])
    const { save } = useChangeConfigurationForm('hash1', keys)
    const result = await save(readonlyKey)
    expect(result).toBe(false)
    expect(mockChangeConfiguration).not.toHaveBeenCalled()
  })

  it('should return false and toast error when the change is rejected', async () => {
    mockChangeConfiguration.mockRejectedValueOnce(new Error('rejected'))
    const keys = ref<ConfigurationKey[]>([writableKey])
    const { save } = useChangeConfigurationForm('hash1', keys)
    const result = await save(writableKey)
    expect(result).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith(
      "Error at setting configuration key 'MeterValueSampleInterval'"
    )
  })

  it('should short-circuit a concurrent save for the same key', async () => {
    let resolveChange: ((value: { status: string }) => void) | undefined
    mockChangeConfiguration.mockReturnValueOnce(
      new Promise<{ status: string }>(resolve => {
        resolveChange = resolve
      })
    )
    const keys = ref<ConfigurationKey[]>([writableKey])
    const { pending, save } = useChangeConfigurationForm('hash1', keys)

    const first = save(writableKey)
    expect(pending.has('MeterValueSampleInterval')).toBe(true)
    const second = await save(writableKey)
    expect(second).toBe(false)
    expect(mockChangeConfiguration).toHaveBeenCalledTimes(1)

    resolveChange?.({ status: 'success' })
    await first
    expect(pending.has('MeterValueSampleInterval')).toBe(false)
  })

  it('should preserve user draft input when new keys arrive', async () => {
    const keys = ref<ConfigurationKey[]>([writableKey])
    const { draftValues } = useChangeConfigurationForm('hash1', keys)
    draftValues.MeterValueSampleInterval = 'edited'
    keys.value = [writableKey, rebootKey]
    await nextTick()
    expect(draftValues.MeterValueSampleInterval).toBe('edited')
    expect(draftValues.AuthorizationKey).toBe('abc')
  })
})
