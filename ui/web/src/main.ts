import { createApp } from 'vue'
import router from '@/router'
import { UIClient } from '@/composables'
import App from '@/App.vue'

const app = createApp(App)

fetch('/config.json')
  .then(response => response.json())
  .then(config => {
    app.config.errorHandler = (error, instance, info) => {
      console.error('Error:', error)
      console.info('Vue instance:', instance)
      console.info('Error info:', info)
      // TODO: Add code for UI notifications or other error handling logic
    }
    app.config.globalProperties.$UIClient = UIClient.getInstance(config)
    app.use(router).mount('#app')
  })
