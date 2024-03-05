export {}

declare module 'vue' {
  interface ComponentCustomProperties {
    $configuration: Ref<ConfigurationData>
    $templates: Ref<string[]>
    $chargingStations: Ref<ChargingStationData[]>
    $uiClient: UIClient
  }
}
