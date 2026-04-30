import type { ChargingStationData, ConfigurationData } from 'ui-common'
import type { InjectionKey, Ref } from 'vue'

import { inject } from 'vue'

import { UIClient } from './UIClient.js'

export const configurationKey: InjectionKey<Ref<ConfigurationData>> = Symbol('configuration')
export const chargingStationsKey: InjectionKey<Ref<ChargingStationData[]>> =
  Symbol('chargingStations')
export const templatesKey: InjectionKey<Ref<string[]>> = Symbol('templates')
export const uiClientKey: InjectionKey<UIClient> = Symbol('uiClient')

export const useUIClient = (): UIClient => {
  const injected = inject(uiClientKey, undefined)
  if (injected != null) return injected
  if (import.meta.env.DEV) {
    console.debug('[useUIClient] Accessed outside provide scope — using singleton fallback')
  }
  return UIClient.getInstance()
}

export const useConfiguration = (): Ref<ConfigurationData> => {
  const injected = inject(configurationKey, undefined)
  if (injected != null) return injected
  throw new Error('configuration not provided')
}

export const useChargingStations = (): Ref<ChargingStationData[]> => {
  const injected = inject(chargingStationsKey, undefined)
  if (injected != null) return injected
  throw new Error('chargingStations not provided')
}

export const useTemplates = (): Ref<string[]> => {
  const injected = inject(templatesKey, undefined)
  if (injected != null) return injected
  throw new Error('templates not provided')
}
