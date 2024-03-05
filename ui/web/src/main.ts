import { type App as AppType, createApp, ref } from 'vue'
import ToastPlugin from 'vue-toast-notification'
import type { ChargingStationData, ConfigurationData } from '@/types'
import { router } from '@/router'
import { UIClient, getFromLocalStorage, setToLocalStorage } from '@/composables'
import App from '@/App.vue'
import 'vue-toast-notification/dist/theme-bootstrap.css'

const app = createApp(App)

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
  if (app.config.globalProperties.$configuration == null) {
    app.config.globalProperties.$configuration = ref<ConfigurationData>(config)
  }
  if (!Array.isArray(app.config.globalProperties.$templates?.value)) {
    app.config.globalProperties.$templates = ref<string[]>([])
  }
  if (!Array.isArray(app.config.globalProperties.$chargingStations?.value)) {
    app.config.globalProperties.$chargingStations = ref<ChargingStationData[]>([])
  }
  if (
    getFromLocalStorage<number | undefined>('uiServerConfigurationIndex', undefined) == null ||
    getFromLocalStorage<number>('uiServerConfigurationIndex', 0) >
      app.config.globalProperties.$configuration.value.uiServer.length - 1
  ) {
    setToLocalStorage<number>('uiServerConfigurationIndex', 0)
  }
  if (app.config.globalProperties.$uiClient == null) {
    app.config.globalProperties.$uiClient = UIClient.getInstance(
      app.config.globalProperties.$configuration.value.uiServer[
        getFromLocalStorage<number>('uiServerConfigurationIndex', 0)
      ]
    )
  }
  app.use(router).use(ToastPlugin).mount('#app')
}

fetch('/config.json')
  .then(response => {
    if (!response.ok) {
      // TODO: add code for UI notifications or other error handling logic
      console.error('Failed to fetch app configuration')
      return
    }
    response
      .json()
      .then(config => {
        initializeApp(app, config)
      })
      .catch(error => {
        // TODO: add code for UI notifications or other error handling logic
        console.error('Error at deserializing JSON app configuration:', error)
      })
  })
  .catch(error => {
    // TODO: add code for UI notifications or other error handling logic
    console.error('Error at fetching app configuration:', error)
  })
