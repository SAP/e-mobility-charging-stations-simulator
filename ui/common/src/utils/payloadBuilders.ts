import type { RequestPayload } from '../types/UIProtocol.js'

import {
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
} from '../types/ChargingStationType.js'

/**
 * Builds an Authorize request payload adapted to the station's OCPP version.
 * @param idTag - RFID tag identifier
 * @param ocppVersion - Target OCPP version (1.6 format if undefined)
 * @returns Payload with flat `idTag` for 1.6 or nested `idToken` for 2.0.x
 */
export function buildAuthorizePayload (
  idTag: string,
  ocppVersion: OCPPVersion | undefined
): RequestPayload {
  if (isOCPP20x(ocppVersion)) {
    return {
      idToken: { idToken: idTag, type: OCPP20IdTokenEnumType.ISO14443 },
    }
  }
  assertOCPP16OrUndefined(ocppVersion)
  return { idTag }
}

/**
 * Builds an OCPP 2.0.x IdTokenType object.
 * @param idTag - RFID tag identifier
 * @param type - Token type enumeration value
 * @returns IdTokenType object
 */
export function buildIdToken (
  idTag: string,
  type: OCPP20IdTokenEnumType = OCPP20IdTokenEnumType.ISO14443
): OCPP20IdTokenType {
  return { idToken: idTag, type }
}

/**
 * Builds a StartTransaction/TransactionEvent payload adapted to the station's OCPP version.
 * @param connectorId - Connector identifier
 * @param ocppVersion - Target OCPP version
 * @param options - Optional fields
 * @param options.evseId - EVSE identifier (OCPP 2.0.x only)
 * @param options.idTag - RFID tag identifier
 * @returns Payload and procedure name to use
 */
export function buildStartTransactionPayload (
  connectorId: number,
  ocppVersion: OCPPVersion | undefined,
  options?: { evseId?: number; idTag?: string }
): { payload: RequestPayload; procedureName: 'startTransaction' | 'transactionEvent' } {
  if (isOCPP20x(ocppVersion)) {
    return {
      payload: {
        connectorId,
        eventType: OCPP20TransactionEventEnumType.STARTED,
        ...(options?.evseId != null && { evseId: options.evseId }),
        ...(options?.idTag != null && {
          idToken: { idToken: options.idTag, type: OCPP20IdTokenEnumType.ISO14443 },
        }),
      },
      procedureName: 'transactionEvent',
    }
  }
  assertOCPP16OrUndefined(ocppVersion)
  return {
    payload: { connectorId, ...(options?.idTag != null && { idTag: options.idTag }) },
    procedureName: 'startTransaction',
  }
}

/**
 * Builds a StopTransaction/TransactionEvent payload adapted to the station's OCPP version.
 * @param transactionId - Transaction identifier (integer for 1.6, string for 2.0.x)
 * @param ocppVersion - Target OCPP version
 * @param connectorId - Connector identifier (OCPP 2.0.x only)
 * @returns Payload and procedure name to use
 */
export function buildStopTransactionPayload (
  transactionId: number | string,
  ocppVersion: OCPPVersion | undefined,
  connectorId?: number
): { payload: RequestPayload; procedureName: 'stopTransaction' | 'transactionEvent' } {
  if (isOCPP20x(ocppVersion)) {
    return {
      payload: {
        ...(connectorId != null && { connectorId }),
        eventType: OCPP20TransactionEventEnumType.ENDED,
        transactionId: transactionId.toString(),
      },
      procedureName: 'transactionEvent',
    }
  }
  assertOCPP16OrUndefined(ocppVersion)
  return {
    payload: { transactionId },
    procedureName: 'stopTransaction',
  }
}

/**
 * Checks whether the given OCPP version is 2.0 or 2.0.1.
 * @param version - OCPP version to check
 * @returns `true` if version is 2.0 or 2.0.1
 */
export function isOCPP20x (version: OCPPVersion | undefined): boolean {
  return version === OCPPVersion.VERSION_20 || version === OCPPVersion.VERSION_201
}

/**
 * Asserts that the OCPP version is 1.6 or undefined (legacy default).
 * @param version - OCPP version to validate
 * @throws {Error} if version is not 1.6, undefined, or a known 2.0.x variant
 */
function assertOCPP16OrUndefined (version: OCPPVersion | undefined): void {
  if (version != null && version !== OCPPVersion.VERSION_16) {
    throw new Error(`Unsupported OCPP version for payload building: ${version}`)
  }
}
