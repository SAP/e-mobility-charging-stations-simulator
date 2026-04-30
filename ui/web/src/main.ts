import type {
  ChargingStationData,
  ConfigurationData,
  UIServerConfigurationSection,
} from 'ui-common'

import { configurationSchema } from 'ui-common'
import { type App as AppType, type Component, createApp, shallowRef } from 'vue'

import App from '@/App.vue'
import {
  chargingStationsKey,
  configurationKey,
  getFromLocalStorage,
  LEGACY_UI_SERVER_CONFIG_KEY,
  setToLocalStorage,
  templatesKey,
  UI_SERVER_CONFIGURATION_INDEX_KEY,
  UIClient,
  uiClientKey,
} from '@/core/index.js'
import { router } from '@/router'
import { SKIN_STORAGE_KEY, useSkin } from '@/shared/composables/useSkin.js'
import { DEFAULT_THEME, THEME_STORAGE_KEY, useTheme } from '@/shared/composables/useTheme.js'
import { DEFAULT_SKIN } from '@/skins/registry.js'

import 'vue-toast-notification/dist/theme-bootstrap.css'

import './assets/shared.css'
import './assets/themes/base.css'
import './assets/themes/catppuccin-latte.css'
import './assets/themes/dracula.css'
import './assets/themes/gruvbox-dark.css'
import './assets/themes/rose-pine.css'
import './assets/themes/sap-horizon.css'
import './assets/themes/teal-dark.css'
import './assets/themes/teal-light.css'
import './assets/themes/tokyo-night-storm.css'

const initializeApp = async (app: AppType, config: ConfigurationData): Promise<void> => {
  app.config.errorHandler = (error, instance, info) => {
    console.error('Error:', error)
    console.info('Vue instance:', instance)
    console.info('Error info:', info)
    // TODO: add code for UI notifications or other error handling logic
  }

  const { switchTheme } = useTheme()
  const storedTheme = getFromLocalStorage<string>(THEME_STORAGE_KEY, config.theme ?? DEFAULT_THEME)
  switchTheme(storedTheme)

  const { switchSkin } = useSkin()
  if (getFromLocalStorage<string>(SKIN_STORAGE_KEY, '') === '' && config.skin != null) {
    setToLocalStorage<string>(SKIN_STORAGE_KEY, config.skin)
  }
  const initialSkin = getFromLocalStorage<string>(SKIN_STORAGE_KEY, config.skin ?? 'classic')
  const switched = await switchSkin(initialSkin)
  if (!switched && initialSkin !== DEFAULT_SKIN) {
    console.warn(`[useSkin] Failed to load skin '${initialSkin}', falling back to default`)
    await switchSkin(DEFAULT_SKIN)
  }

  if (!Array.isArray(config.uiServer)) {
    config.uiServer = [config.uiServer]
  }
  const configuration = shallowRef(config)
  const templates = shallowRef<string[]>([])
  const chargingStations = shallowRef<ChargingStationData[]>([])
  try {
    const legacyIndex = localStorage.getItem(LEGACY_UI_SERVER_CONFIG_KEY)
    if (legacyIndex != null && localStorage.getItem(UI_SERVER_CONFIGURATION_INDEX_KEY) == null) {
      localStorage.setItem(UI_SERVER_CONFIGURATION_INDEX_KEY, legacyIndex)
      localStorage.removeItem(LEGACY_UI_SERVER_CONFIG_KEY)
    }
  } catch {
    // localStorage access can throw in restricted environments
  }
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
    const errorPre = document.createElement('pre')
    errorPre.className = 'config-error'
    errorPre.textContent = 'Failed to load configuration. Check that config.json is accessible.'
    document.body.replaceChildren(errorPre)
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
      const msgs = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n')
      const errorPre = document.createElement('pre')
      errorPre.className = 'config-error'
      errorPre.textContent = `Configuration error in config.json:\n${msgs}`
      document.body.replaceChildren(errorPre)
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
