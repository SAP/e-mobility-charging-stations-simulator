import { createApp } from 'vue'
import type { ConfigurationData } from './types'
import router from '@/router'
import { UIClient } from '@/composables'
import App from '@/App.vue'

const initializeApp = async (config: ConfigurationData) => {
  const app = createApp(App)
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: Add code for UI notifications or other error handling logic
  }
  app.config.globalProperties.$UIClient = UIClient.getInstance(config)
  app.config.globalProperties.$UIClient.openWS()
  app.use(router).mount('#app')
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
  })
