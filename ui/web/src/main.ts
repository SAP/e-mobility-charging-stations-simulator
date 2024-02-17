import { createApp } from 'vue'
import type { ConfigurationData, ResponsePayload } from './types'
import { router } from '@/router'
import { UIClient } from '@/composables'
import App from '@/App.vue'

const initializeApp = (config: ConfigurationData) => {
  const app = createApp(App)
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: add code for UI notifications or other error handling logic
  }
  app.config.globalProperties.$uiClient = UIClient.getInstance(config)
  app.config.globalProperties.$uiClient.registerWSonOpenListener(() => {
    app.config.globalProperties.$uiClient
      .listChargingStations()
      .then((response: ResponsePayload) => {
        app.config.globalProperties.$chargingStations = response.chargingStations
      })
      .catch((error: Error) => {
        // TODO: add code for UI notifications or other error handling logic
        console.error('Error at fetching charging stations:', error)
        throw error
      })
      .finally(() => {
        app.use(router).mount('#app')
      })
  })
}

fetch('/config.json')
  .then(response => response.json())
  .catch(error => {
    console.error('Error at fetching app configuration:', error)
    throw error
  })
  .then(config => {
    initializeApp(config)
  })
  .catch(error => {
    console.error('Error at initializing app:', error)
    throw error
  })
