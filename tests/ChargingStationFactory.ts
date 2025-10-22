import type { ChargingStation } from '../src/charging-station/index.js'
import type {
  ChargingStationConfiguration,
  ChargingStationInfo,
  ChargingStationTemplate,
} from '../src/types/index.js'

import {
  OCPP20ConnectorStatusEnumType,
  OCPP20OptionalVariableName,
  OCPPVersion,
} from '../src/types/index.js'

/**
 * Options to customize the construction of a ChargingStation test instance
 */
export interface ChargingStationOptions {
  baseName?: string
  hasEvses?: boolean
  heartbeatInterval?: number
  ocppConfiguration?: ChargingStationConfiguration
  started?: boolean
  starting?: boolean
  stationInfo?: Partial<ChargingStationInfo>
  websocketPingInterval?: number
}

/**
 * Creates a ChargingStation instance for tests
 * @param options - Options to customize the ChargingStation instance
 * @returns A mock ChargingStation instance
 */
export function createChargingStation (options: ChargingStationOptions = {}): ChargingStation {
  const baseName = options.baseName ?? 'CS-TEST'
  const templateIndex = 1
  const heartbeatInterval = options.heartbeatInterval ?? 60
  const websocketPingInterval = options.websocketPingInterval ?? 30

  return {
    connectors: new Map(),
    evses: new Map(),
    getHeartbeatInterval: () => heartbeatInterval,
    hasEvses: options.hasEvses ?? false,
    inAcceptedState: () => true,
    logPrefix: () => `${baseName} |`,
    ocppConfiguration: options.ocppConfiguration ?? {
      configurationKey: [
        {
          key: OCPP20OptionalVariableName.WebSocketPingInterval,
          value: websocketPingInterval.toString(),
        },
        { key: OCPP20OptionalVariableName.HeartbeatInterval, value: heartbeatInterval.toString() },
      ],
    },
    started: options.started ?? false,
    starting: options.starting,
    stationInfo: {
      baseName,
      chargingStationId: `${baseName}-00001`,
      hashId: 'test-hash-id',
      maximumAmperage: 16,
      maximumPower: 12000,
      templateIndex,
      templateName: 'test-template.json',
      ...options.stationInfo,
    },
    wsConnection: {
      pingInterval: websocketPingInterval,
    },
  } as unknown as ChargingStation
}

/**
 * Creates a ChargingStation template for tests
 * @param baseName - Base name for the template
 * @returns A ChargingStationTemplate instance
 */
export function createChargingStationTemplate (baseName = 'CS-TEST'): ChargingStationTemplate {
  return {
    baseName,
  } as ChargingStationTemplate
}

/**
 * Creates a ChargingStation instance with connectors and EVSEs configured for OCPP 2.0
 * @param options - Options to customize the ChargingStation instance
 * @returns A mock ChargingStation instance with EVSEs
 */
export function createChargingStationWithEvses (
  options: ChargingStationOptions = {}
): ChargingStation {
  const chargingStation = createChargingStation({
    hasEvses: true,
    stationInfo: {
      ocppVersion: OCPPVersion.VERSION_201,
      ...options.stationInfo,
    },
    ...options,
  })

  // Add default connectors and EVSEs
  Object.assign(chargingStation, {
    connectors: new Map([
      [1, { status: OCPP20ConnectorStatusEnumType.Available }],
      [2, { status: OCPP20ConnectorStatusEnumType.Available }],
    ]),
    evses: new Map([
      [1, { connectors: new Map([[1, {}]]) }],
      [2, { connectors: new Map([[1, {}]]) }],
    ]),
  })

  return chargingStation
}
