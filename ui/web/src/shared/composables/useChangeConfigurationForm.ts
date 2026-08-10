import { type ConfigurationKey } from 'ui-common'
import { type DeepReadonly, reactive, readonly } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/core/index.js'

/**
 * Returns per-key submission logic for editing OCPP configuration keys, shared by both
 * skins so the mutation flow, toast messaging and pending tracking stay single-sourced.
 * Read-only keys are never submitted (the backend also rejects them). A successful change
 * on a `reboot` key surfaces a reboot-required notice, mirroring the OCPP spec semantics.
 * @param hashId - The charging station hash identifier
 * @returns The reactive set of keys with an in-flight change and a per-key submit function
 */
export function useChangeConfigurationForm (hashId: string): {
  pending: DeepReadonly<Set<string>>
  submit: (configurationKey: ConfigurationKey, value: string) => Promise<boolean>
} {
  const $uiClient = useUIClient()
  const $toast = useToast()

  const pending = reactive(new Set<string>())

  /**
   * Submits a new value for a configuration key.
   * @param configurationKey - The raw configuration key being edited
   * @param value - The new value to apply
   * @returns Whether the change was accepted
   */
  async function submit (configurationKey: ConfigurationKey, value: string): Promise<boolean> {
    if (configurationKey.readonly || pending.has(configurationKey.key)) {
      return false
    }
    pending.add(configurationKey.key)
    try {
      await $uiClient.changeConfiguration(hashId, configurationKey.key, value)
      $toast.success(
        configurationKey.reboot === true
          ? `Configuration key '${configurationKey.key}' set, reboot required to take effect`
          : `Configuration key '${configurationKey.key}' successfully set`
      )
      return true
    } catch (error: unknown) {
      $toast.error(`Error at setting configuration key '${configurationKey.key}'`)
      console.error(`Error at setting configuration key '${configurationKey.key}':`, error)
      return false
    } finally {
      pending.delete(configurationKey.key)
    }
  }

  return {
    pending: readonly(pending),
    submit,
  }
}
