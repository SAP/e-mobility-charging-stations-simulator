import type { UIServerConfigurationSection } from 'ui-common'
import type { Ref } from 'vue'

import { onScopeDispose, readonly, ref } from 'vue'

import {
  getFromLocalStorage,
  setToLocalStorage,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  useConfiguration,
  useUIClient,
} from '@/core/index.js'

export interface ServerSwitchActions {
  /** Switches the active UI server, with error rollback on connection failure. */
  handleUIServerChange: (newIndex: number) => void
  /** Whether a server switch operation is in progress. */
  serverSwitchPending: Readonly<Ref<boolean>>
}

export interface ServerSwitchOptions {
  /** Called after a successful server switch (e.g. to clear UI state). */
  onServerSwitched?: () => void
  /** Registers WS event listeners after connection reconfiguration. */
  registerWSEventListeners: () => void
  /** Unregisters WS event listeners before connection reconfiguration. */
  unregisterWSEventListeners: () => void
}

const SERVER_SWITCH_TIMEOUT_MS = 15_000

/**
 * Composable encapsulating the UI server switch state machine.
 *
 * Handles optimistic connection switching with timeout-based rollback on failure.
 * @param options - Callbacks for event listener management and switch completion
 * @returns Server switch actions and pending state
 */
export function useServerSwitch (options: ServerSwitchOptions): ServerSwitchActions {
  const $uiClient = useUIClient()
  const $configuration = useConfiguration()

  const { registerWSEventListeners, unregisterWSEventListeners } = options

  const serverSwitchPending = ref(false)
  let activeTimeoutId: ReturnType<typeof setTimeout> | undefined
  let pendingOpenHandler: (() => void) | undefined
  let pendingErrorHandler: (() => void) | undefined

  const handleUIServerChange = (newIndex: number): void => {
    const currentIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
    if (newIndex === currentIndex || serverSwitchPending.value) return

    const servers = $configuration.value.uiServer as UIServerConfigurationSection[]
    if (newIndex < 0 || newIndex >= servers.length) return

    serverSwitchPending.value = true

    $uiClient.setConfiguration(servers[newIndex])
    unregisterWSEventListeners()
    registerWSEventListeners()

    let settled = false

    const openHandler = (): void => {
      if (settled) return
      settled = true
      clearTimeout(activeTimeoutId)
      $uiClient.unregisterWSEventListener('error', errorHandler)
      pendingOpenHandler = undefined
      pendingErrorHandler = undefined
      setToLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, newIndex)
      serverSwitchPending.value = false
      options.onServerSwitched?.()
    }

    const errorHandler = (): void => {
      if (settled) return
      settled = true
      clearTimeout(activeTimeoutId)
      $uiClient.unregisterWSEventListener('open', openHandler)
      pendingOpenHandler = undefined
      pendingErrorHandler = undefined
      serverSwitchPending.value = false
      const previousIndex = getFromLocalStorage<number>(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
      const rollbackServers = $configuration.value.uiServer as UIServerConfigurationSection[]
      if (previousIndex >= 0 && previousIndex < rollbackServers.length) {
        $uiClient.setConfiguration(rollbackServers[previousIndex])
      }
      unregisterWSEventListeners()
      registerWSEventListeners()
    }

    $uiClient.registerWSEventListener('open', openHandler, { once: true })
    $uiClient.registerWSEventListener('error', errorHandler, { once: true })
    pendingOpenHandler = openHandler
    pendingErrorHandler = errorHandler

    activeTimeoutId = setTimeout(() => {
      if (!settled) {
        errorHandler()
      }
    }, SERVER_SWITCH_TIMEOUT_MS)
  }

  onScopeDispose(() => {
    if (activeTimeoutId != null) {
      clearTimeout(activeTimeoutId)
      activeTimeoutId = undefined
    }
    if (pendingOpenHandler != null) {
      $uiClient.unregisterWSEventListener('open', pendingOpenHandler)
      pendingOpenHandler = undefined
    }
    if (pendingErrorHandler != null) {
      $uiClient.unregisterWSEventListener('error', pendingErrorHandler)
      pendingErrorHandler = undefined
    }
  })

  return {
    handleUIServerChange,
    serverSwitchPending: readonly(serverSwitchPending),
  }
}
