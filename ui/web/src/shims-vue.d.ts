export type {}

declare module 'vue' {
  export interface GlobalComponents {
    RouterLink: (typeof import('vue-router'))['RouterLink']
    RouterView: (typeof import('vue-router'))['RouterView']
  }
  interface ComponentCustomProperties {
    $configuration: import('vue').Ref<import('@/types').ConfigurationData> | undefined
    $templates: import('vue').Ref<string[]> | undefined
    $chargingStations: import('vue').Ref<import('@/types').ChargingStationData[]> | undefined
    $uiClient: import('@/composables').UIClient | undefined
  }
}
