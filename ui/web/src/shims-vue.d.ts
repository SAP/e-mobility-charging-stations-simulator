export {}

declare module 'vue' {
  export interface GlobalComponents {
    RouterLink: (typeof import('vue-router'))['RouterLink']
    RouterView: (typeof import('vue-router'))['RouterView']
  }
  interface ComponentCustomProperties {
    $configuration: Ref<import('@/types').ConfigurationData>
    $templates: Ref<string[]>
    $chargingStations: Ref<import('@/types').ChargingStationData[]>
    $uiClient: import('@/composables').UIClient
  }
}
