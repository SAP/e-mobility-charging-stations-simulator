import { type App as AppType, type Component, createApp, ref } from 'vue'
import ToastPlugin from 'vue-toast-notification'

import type { ChargingStationData, ConfigurationData, UIServerConfigurationSection } from '@/types'

import App from '@/App.vue'
import {
  chargingStationsKey,
  configurationKey,
  getFromLocalStorage,
  setToLocalStorage,
  templatesKey,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  UIClient,
  uiClientKey,
} from '@/composables'
import { router } from '@/router'

import 'vue-toast-notification/dist/theme-bootstrap.css'

const DEFAULT_THEME = 'tokyo-night-storm'

const loadTheme = async (theme: string): Promise<void> => {
  try {
    await import(`./assets/themes/${theme}.css`)
  } catch {
    console.error(`Theme '${theme}' not found, falling back to '${DEFAULT_THEME}'`)
    await import(`./assets/themes/${DEFAULT_THEME}.css`)
  }
}

const app = createApp(App as Component)

const initializeApp = async (app: AppType, config: ConfigurationData): Promise<void> => {
  await loadTheme(config.theme ?? DEFAULT_THEME)
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: add code for UI notifications or other error handling logic
  }
  if (!Array.isArray(config.uiServer)) {
    config.uiServer = [config.uiServer]
  }
  const configuration = ref(config)
  const templates = ref<string[]>([])
  const chargingStations = ref<ChargingStationData[]>([])
  if (
    getFromLocalStorage<number | undefined>(UI_SERVER_CONFIGURATION_INDEX_KEY, undefined) == null ||
    getFromLocalStorage(UI_SERVER_CONFIGURATION_INDEX_KEY, 0) >
      (configuration.value.uiServer as UIServerConfigurationSection[]).length - 1
  ) {
    setToLocalStorage(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
  }
  const uiClient = UIClient.getInstance(
    (configuration.value.uiServer as UIServerConfigurationSection[])[
      getFromLocalStorage(UI_SERVER_CONFIGURATION_INDEX_KEY, 0)
    ]
  )
  app.provide(configurationKey, configuration)
  app.provide(chargingStationsKey, chargingStations)
  app.provide(templatesKey, templates)
  app.provide(uiClientKey, uiClient)
  app.use(router).use(ToastPlugin).mount('#app')
}

fetch('/config.json')
  .then(response => {
    if (!response.ok) {
      // TODO: add code for UI notifications or other error handling logic
      console.error('Failed to fetch app configuration')
      return undefined
    }
    response
      .json()
      // eslint-disable-next-line promise/no-nesting
      .then(async config => {
        await initializeApp(app, config as ConfigurationData)
        return undefined
      })
      // eslint-disable-next-line promise/no-nesting
      .catch((error: unknown) => {
        // TODO: add code for UI notifications or other error handling logic
        console.error('Error at deserializing JSON app configuration:', error)
      })
    return undefined
  })
  .catch((error: unknown) => {
    // TODO: add code for UI notifications or other error handling logic
    console.error('Error at fetching app configuration:', error)
  })
