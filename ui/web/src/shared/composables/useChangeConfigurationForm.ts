import { type ConfigurationKey } from 'ui-common'
import { type DeepReadonly, reactive, readonly, type Ref, watch } from 'vue'
import { useToast } from 'vue-toast-notification'

import { useUIClient } from '@/core/index.js'

/**
 * Returns per-key draft state and submission logic for changing OCPP configuration keys,
 * shared by both skins so the draft seeding, mutation flow, toast messaging and pending
 * tracking stay single-sourced. Read-only keys are never submitted (the backend also rejects
 * them). A successful change on a `reboot` key surfaces a reboot-required notice, mirroring
 * the OCPP spec semantics.
 * @param hashId - The charging station hash identifier
 * @param editableConfigurationKeys - The reactive set of configuration keys the form operates on
 * @returns The per-key draft values, the keys with an in-flight change, and a per-key save function
 */
export function useChangeConfigurationForm (
  hashId: string,
  editableConfigurationKeys: Readonly<Ref<ConfigurationKey[]>>
): {
    draftValues: Record<string, string>
    pending: DeepReadonly<Set<string>>
    save: (configurationKey: ConfigurationKey) => Promise<boolean>
  } {
  const $uiClient = useUIClient()
  const $toast = useToast()

  const pending = reactive(new Set<string>())
  const draftValues = reactive<Record<string, string>>({})

  // Seed a draft entry for each new key without clobbering in-flight user input.
  watch(
    editableConfigurationKeys,
    configurationKeys => {
      for (const configurationKey of configurationKeys) {
        if (!(configurationKey.key in draftValues)) {
          draftValues[configurationKey.key] = configurationKey.value ?? ''
        }
      }
    },
    { immediate: true }
  )

  /**
   * Submits a new value for a configuration key.
   * @param configurationKey - The configuration key being changed
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

  /**
   * Submits the current draft value for a configuration key.
   * @param configurationKey - The configuration key being changed
   * @returns Whether the change was accepted
   */
  async function save (configurationKey: ConfigurationKey): Promise<boolean> {
    return await submit(configurationKey, draftValues[configurationKey.key] ?? '')
  }

  return {
    draftValues,
    pending: readonly(pending),
    save,
  }
}
