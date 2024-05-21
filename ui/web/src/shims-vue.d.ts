export type {}

declare module 'vue' {
  export interface GlobalComponents {
    RouterLink: (typeof import('vue-router'))['RouterLink']
    RouterView: (typeof import('vue-router'))['RouterView']
  }
  interface ComponentCustomProperties {
    $configuration: import('vue').Ref<import('@/types').ConfigurationData>
    $templates: import('vue').Ref<string[]>
    $chargingStations: import('vue').Ref<import('@/types').ChargingStationData[]>
    $uiClient: import('@/composables').UIClient
  }
}
