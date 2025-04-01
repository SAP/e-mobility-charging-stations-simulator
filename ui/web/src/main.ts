import type { ChargingStationData, ConfigurationData, UIServerConfigurationSection } from '@/types'

import App from '@/App.vue'
import { getFromLocalStorage, setToLocalStorage, UIClient } from '@/composables'
import { router } from '@/router'
import { type App as AppType, type Component, createApp, ref } from 'vue'
import ToastPlugin from 'vue-toast-notification'
import 'vue-toast-notification/dist/theme-bootstrap.css'

const app = createApp(App as Component)

const initializeApp = (app: AppType, config: ConfigurationData) => {
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: add code for UI notifications or other error handling logic
  }
  if (!Array.isArray(config.uiServer)) {
    config.uiServer = [config.uiServer]
  }
  app.config.globalProperties.$configuration ??= ref<ConfigurationData>(config)
  if (!Array.isArray(app.config.globalProperties.$templates?.value)) {
    app.config.globalProperties.$templates = ref<string[]>([])
  }
  if (!Array.isArray(app.config.globalProperties.$chargingStations?.value)) {
    app.config.globalProperties.$chargingStations = ref<ChargingStationData[]>([])
  }
  if (
    getFromLocalStorage<number | undefined>('uiServerConfigurationIndex', undefined) == null ||
    getFromLocalStorage<number>('uiServerConfigurationIndex', 0) >
      (app.config.globalProperties.$configuration.value.uiServer as UIServerConfigurationSection[])
        .length -
        1
  ) {
    setToLocalStorage<number>('uiServerConfigurationIndex', 0)
  }
  app.config.globalProperties.$uiClient ??= UIClient.getInstance(
    (app.config.globalProperties.$configuration.value.uiServer as UIServerConfigurationSection[])[
      getFromLocalStorage<number>('uiServerConfigurationIndex', 0)
    ]
  )
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
      .then(config => {
        initializeApp(app, config as ConfigurationData)
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
