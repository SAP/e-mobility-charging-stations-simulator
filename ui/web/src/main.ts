import { createApp } from 'vue'
import ToastPlugin from 'vue-toast-notification'
import type { ConfigurationData, ResponsePayload } from '@/types'
import { router } from '@/router'
import { UIClient } from '@/composables'
import App from '@/App.vue'
import 'vue-toast-notification/dist/theme-bootstrap.css'

const initializeApp = (config: ConfigurationData) => {
  const app = createApp(App)
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: add code for UI notifications or other error handling logic
  }
  app.config.globalProperties.$configuration = config
  app.config.globalProperties.$chargingStations = []
  app.config.globalProperties.$uiClient = UIClient.getInstance(
    app.config.globalProperties.$configuration.uiServer
  )
  app.config.globalProperties.$uiClient.registerWSEventListener('open', () => {
    app.config.globalProperties.$uiClient
      .listChargingStations()
      .then((response: ResponsePayload) => {
        app.config.globalProperties.$chargingStations = response.chargingStations
      })
      .catch((error: Error) => {
        // TODO: add code for UI notifications or other error handling logic
        console.error('Error at fetching charging stations:', error)
      })
      .finally(() => {
        app.use(router).use(ToastPlugin).mount('#app')
      })
  })
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
        try {
          initializeApp(config)
        } catch (error) {
          // TODO: add code for UI notifications or other error handling logic
          console.error('Error at initializing app:', error)
        }
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
