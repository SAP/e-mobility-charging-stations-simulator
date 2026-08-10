import { type ChargingStationData } from 'ui-common'
import { computed, type ComputedRef } from 'vue'

import { useChargingStations } from '@/core/index.js'
import {
  buildConfigurationRows,
  buildStationDetailSections,
  type ConfigurationRow,
  type DetailSection,
} from '@/shared/utils/index.js'

export interface StationDetailsView {
  configurationRows: ComputedRef<ConfigurationRow[]>
  sections: ComputedRef<DetailSection[]>
  station: ComputedRef<ChargingStationData | undefined>
}

/**
 * Resolves a charging station from the store by hash id and derives its read-only
 * "Show details" view model (detail sections + OCPP configuration rows). Shared by both
 * skins so the reactive lookup and view-model wiring stay single-sourced. The view stays
 * reactive to store updates and degrades to `undefined`/empty when the station is removed.
 * @param hashId - The charging station hash identifier
 * @returns The resolved station and its derived detail sections and configuration rows
 */
export function useStationDetails (hashId: string): StationDetailsView {
  const $chargingStations = useChargingStations()

  const station = computed(() =>
    $chargingStations.value.find(entry => entry.stationInfo.hashId === hashId)
  )

  const sections = computed(() =>
    station.value != null ? buildStationDetailSections(station.value) : []
  )

  const configurationRows = computed(() =>
    station.value != null ? buildConfigurationRows(station.value) : []
  )

  return {
    configurationRows,
    sections,
    station,
  }
}
