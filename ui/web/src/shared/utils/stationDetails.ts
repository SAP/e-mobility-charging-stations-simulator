/**
 * @file stationDetails.ts
 * @description Pure utility functions building the read-only "Show details" view model
 * from `ChargingStationData`. These are not Vue composables (no reactive state) — they are
 * pure utility functions consumed by both skins via the shared layer, so field selection,
 * ordering, labelling and formatting stay single-sourced.
 *
 * Security invariant: `supervisionPassword` is always masked (never rendered raw); the
 * supervision URL is passed through {@link formatSupervisionUrl}, which strips any embedded
 * userinfo credentials (protocol, host and path are preserved).
 */
import { type ChargingStationData, type ConfigurationKey, getWebSocketStateName } from 'ui-common'

import { EMPTY_VALUE_PLACEHOLDER, MASKED_VALUE_PLACEHOLDER } from '@/core/index.js'

import { formatSupervisionUrl } from './formatSupervisionUrl.js'
import { getConnectorEntries } from './stationStatus.js'

export interface ConfigurationRow {
  key: string
  readonly: string
  reboot: string
  value: string
}

export interface DetailEntry {
  label: string
  value: string
}

export interface DetailSection {
  entries: DetailEntry[]
  title: string
}

/**
 * Formats a boolean flag for display; undefined renders as "No".
 * @param value - The raw boolean flag
 * @returns "Yes" or "No"
 */
const formatBoolean = (value: boolean | undefined): string => (value === true ? 'Yes' : 'No')

/**
 * Formats a date-like station field for display.
 * Nullish values render as the empty placeholder; otherwise the localized date-time string.
 * @param value - The raw date, epoch millisecond timestamp, or ISO string
 * @returns A display string
 */
const formatDate = (value: Date | number | string | undefined): string =>
  value == null ? EMPTY_VALUE_PLACEHOLDER : new Date(value).toLocaleString()

/**
 * Formats a scalar station field for display.
 * Booleans render as Yes/No; nullish or empty values render as the empty placeholder.
 * @param value - The raw field value
 * @returns A display string
 */
const formatValue = (value: boolean | number | string | undefined): string => {
  if (typeof value === 'boolean') {
    return formatBoolean(value)
  }
  if (value == null || value === '') {
    return EMPTY_VALUE_PLACEHOLDER
  }
  return String(value)
}

/**
 * Builds display rows for the visible OCPP configuration keys.
 * @param station - The charging station data
 * @returns Formatted configuration rows (key, value, readonly, reboot)
 */
export function buildConfigurationRows (station: ChargingStationData): ConfigurationRow[] {
  return getVisibleConfigurationKeys(station).map(key => ({
    key: key.key,
    readonly: formatBoolean(key.readonly),
    reboot: formatBoolean(key.reboot),
    value: formatValue(key.value),
  }))
}

/**
 * Builds the ordered detail sections for a charging station.
 * @param station - The charging station data
 * @returns Ordered sections of labelled key/value entries
 */
export function buildStationDetailSections (station: ChargingStationData): DetailSection[] {
  const { stationInfo } = station
  const sections: DetailSection[] = [
    {
      entries: [
        { label: 'Charging Station Id', value: formatValue(stationInfo.chargingStationId) },
        { label: 'Started', value: formatValue(station.started) },
        { label: 'Supervision Url', value: formatSupervisionUrl(station.supervisionUrl) },
        {
          label: 'WebSocket State',
          value: formatValue(getWebSocketStateName(station.wsState)),
        },
        {
          label: 'Registration Status',
          value: formatValue(station.bootNotificationResponse?.status),
        },
        { label: 'Connectors', value: formatValue(getConnectorEntries(station).length) },
        { label: 'Last Update', value: formatDate(station.timestamp) },
      ],
      title: 'General',
    },
    {
      entries: [
        { label: 'Base Name', value: formatValue(stationInfo.baseName) },
        { label: 'Template', value: formatValue(stationInfo.templateName) },
        { label: 'Template Index', value: formatValue(stationInfo.templateIndex) },
        { label: 'Vendor', value: formatValue(stationInfo.chargePointVendor) },
        { label: 'Model', value: formatValue(stationInfo.chargePointModel) },
        { label: 'Firmware Version', value: formatValue(stationInfo.firmwareVersion) },
        { label: 'OCPP Version', value: formatValue(stationInfo.ocppVersion) },
        { label: 'OCPP Protocol', value: formatValue(stationInfo.ocppProtocol) },
        { label: 'Current Out Type', value: formatValue(stationInfo.currentOutType) },
        { label: 'Number Of Phases', value: formatValue(stationInfo.numberOfPhases) },
        { label: 'Voltage Out', value: formatValue(stationInfo.voltageOut) },
        { label: 'Maximum Power (W)', value: formatValue(stationInfo.maximumPower) },
        { label: 'Maximum Amperage (A)', value: formatValue(stationInfo.maximumAmperage) },
        { label: 'Auto Register', value: formatValue(stationInfo.autoRegister) },
        { label: 'Auto Start', value: formatValue(stationInfo.autoStart) },
        {
          label: 'OCPP Strict Compliance',
          value: formatValue(stationInfo.ocppStrictCompliance),
        },
      ],
      title: 'Station Info',
    },
    {
      entries: [
        { label: 'Supervision User', value: formatValue(stationInfo.supervisionUser) },
        {
          label: 'Supervision Password',
          value:
            stationInfo.supervisionPassword == null || stationInfo.supervisionPassword === ''
              ? EMPTY_VALUE_PLACEHOLDER
              : MASKED_VALUE_PLACEHOLDER,
        },
      ],
      title: 'Credentials',
    },
  ]

  if (station.bootNotificationResponse != null) {
    sections.push({
      entries: [
        { label: 'Interval', value: formatValue(station.bootNotificationResponse.interval) },
        {
          label: 'Current Time',
          value: formatDate(station.bootNotificationResponse.currentTime),
        },
      ],
      title: 'Boot Notification',
    })
  }

  if (station.automaticTransactionGenerator?.automaticTransactionGenerator != null) {
    sections.push({
      entries: [
        {
          label: 'Enabled',
          value: formatValue(
            station.automaticTransactionGenerator.automaticTransactionGenerator.enable
          ),
        },
      ],
      title: 'Automatic Transaction Generator',
    })
  }

  return sections
}

/**
 * Returns the visible OCPP configuration keys for a charging station.
 * Keys explicitly marked `visible: false` are excluded; a missing configuration yields [].
 * @param station - The charging station data
 * @returns The visible configuration keys
 */
export function getVisibleConfigurationKeys (station: ChargingStationData): ConfigurationKey[] {
  return station.ocppConfiguration.configurationKey?.filter(key => key.visible !== false) ?? []
}
