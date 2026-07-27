import type { ConnectorEntry, ConnectorStatus } from './ConnectorStatus.js'
import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates.js'
import type { AvailabilityType } from './ocpp/Requests.js'

export interface EvseEntry {
  readonly evseId: number
  readonly evseStatus: EvseStatus
}

/**
 * JSON-wire projection of {@link EvseEntry} carried by `ChargingStationData.evses`;
 * `evseStatus.connectors` is a serialization-safe `ConnectorEntry[]`, whereas the
 * in-memory {@link EvseEntry} keeps a `Map`. Mirrors the ui-common `EvseEntry` wire
 * shape (duplicated because packages share no re-exports).
 */
export interface EvseEntryData {
  readonly evseId: number
  readonly evseStatus: EvseStatusData
}

export interface EvseStatus {
  availability: AvailabilityType
  connectors: Map<number, ConnectorStatus>
  MeterValues?: SampledValueTemplate[]
}

/**
 * JSON-wire projection of {@link EvseStatus}: `connectors` is a `ConnectorEntry[]`
 * (a `Map` serializes to `{}`). `MeterValues` is intentionally omitted — the producer
 * `buildEvseEntries` never emits it and no UI-facing consumer reads it off the wire.
 */
export interface EvseStatusData {
  readonly availability: AvailabilityType
  readonly connectors: readonly ConnectorEntry[]
}

export interface EvseTemplate {
  Connectors: Record<string, ConnectorStatus>
  MeterValues?: SampledValueTemplate[]
}
