import { type ChargingStationData, type ConfigurationKey } from 'ui-common'
import { computed, type ComputedRef } from 'vue'

import { useChargingStations } from '@/core/index.js'
import {
  buildConfigurationRows,
  buildStationDetailSections,
  type ConfigurationRow,
  type DetailSection,
  getVisibleConfigurationKeys,
} from '@/shared/utils/index.js'

export interface StationDetailsView {
  configurationRows: ComputedRef<ConfigurationRow[]>
  editableConfigurationKeys: ComputedRef<ConfigurationKey[]>
  sections: ComputedRef<DetailSection[]>
  station: ComputedRef<ChargingStationData | undefined>
}

/**
 * Resolves a charging station from the store by hash id and derives its "Show details"
 * view model: detail sections, the OCPP configuration rows for display, and the visible
 * configuration keys the change-configuration form operates on. Shared by both skins so the
 * reactive lookup and view-model wiring stay single-sourced. The view stays reactive to
 * store updates and degrades to `undefined`/empty when the station is removed.
 * @param hashId - The charging station hash identifier
 * @returns The resolved station with its detail sections, configuration rows and editable keys
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

  const editableConfigurationKeys = computed(() =>
    station.value != null ? getVisibleConfigurationKeys(station.value) : []
  )

  return {
    configurationRows,
    editableConfigurationKeys,
    sections,
    station,
  }
}
