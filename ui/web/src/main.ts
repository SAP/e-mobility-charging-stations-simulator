import { createApp } from 'vue'
import router from '@/router'
import { UIClient } from '@/composables'
import App from '@/App.vue'

const app = createApp(App)

fetch('/config.json')
  .then(response => response.json())
  .then(config => {
    app.config.globalProperties.$UIClient = UIClient.getInstance(config)
    app.use(router).mount('#app')
  })
