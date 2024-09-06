export type {}

declare module 'vue' {
  export interface GlobalComponents {
    RouterLink: (typeof import('vue-router'))['RouterLink']
    RouterView: (typeof import('vue-router'))['RouterView']
  }
  interface ComponentCustomProperties {
    $chargingStations: import('vue').Ref<import('@/types').ChargingStationData[]> | undefined
    $configuration: import('vue').Ref<import('@/types').ConfigurationData> | undefined
    $templates: import('vue').Ref<string[]> | undefined
    $uiClient: import('@/composables').UIClient | undefined
  }
}
