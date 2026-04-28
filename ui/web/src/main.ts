import type {
  ChargingStationData,
  ConfigurationData,
  UIServerConfigurationSection,
} from 'ui-common'

import { configurationSchema } from 'ui-common'

import { type App as AppType, type Component, createApp, ref } from 'vue'

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
import { useSkin } from '@/shared/composables/useSkin.js'
import { type ThemeName, useTheme } from '@/shared/composables/useTheme.js'

import 'vue-toast-notification/dist/theme-bootstrap.css'

// Load all theme CSS files eagerly — they are small (~100 lines each).
// Switching is instant via [data-theme] attribute selector.
import './assets/shared.css'
import './assets/themes/catppuccin-latte.css'
import './assets/themes/sap-horizon.css'
import './assets/themes/tokyo-night-storm.css'

const initializeApp = async (app: AppType, config: ConfigurationData): Promise<void> => {
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: add code for UI notifications or other error handling logic
  }

  const { setTheme } = useTheme()
  const storedTheme = getFromLocalStorage<string>(
    'ecs-ui-theme',
    config.theme ?? 'tokyo-night-storm'
  )
  setTheme(storedTheme as ThemeName)

  const { switchSkin } = useSkin()
  const skinStorageKey = 'ecs-ui-skin'
  if (getFromLocalStorage<string>(skinStorageKey, '') === '' && config.skin != null) {
    setToLocalStorage<string>(skinStorageKey, config.skin)
  }
  const initialSkin = getFromLocalStorage<string>(skinStorageKey, config.skin ?? 'classic')
  await switchSkin(initialSkin)

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
  app.use(router).mount('#app')
}

const bootstrap = async (): Promise<void> => {
  const app = createApp(App as Component)
  let response: Response
  try {
    response = await fetch('/config.json')
  } catch (error: unknown) {
    console.error('Error at fetching app configuration:', error)
    return
  }
  if (!response.ok) {
    console.error('Failed to fetch app configuration')
    return
  }
  let config: ConfigurationData
  try {
    const rawConfig: unknown = await response.json()
    const parseResult = configurationSchema.safeParse(rawConfig)
    if (!parseResult.success) {
      const msgs = parseResult.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('\n')
      document.body.innerHTML = `<pre style="padding:2rem;color:#ef5350;font-family:monospace">Configuration error in config.json:\n${msgs}</pre>`
      return
    }
    config = parseResult.data
  } catch (error: unknown) {
    console.error('Error at deserializing JSON app configuration:', error)
    return
  }
  try {
    await initializeApp(app, config)
  } catch (error: unknown) {
    console.error('Error at initializing app:', error)
  }
}

bootstrap().catch(console.error)
