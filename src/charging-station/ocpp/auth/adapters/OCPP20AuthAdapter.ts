import type {
  AdditionalInfoType,
  JsonObject,
  OCPP20AuthorizeRequest,
  OCPP20AuthorizeResponse,
  RequestStartStopStatusEnumType,
} from '../../../../types/index.js'
import type { ChargingStation } from '../../../index.js'
import type { OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  Identifier,
} from '../types/AuthTypes.js'

import {
  OCPP20ComponentName,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPPVersion,
} from '../../../../types/index.js'
import { getErrorMessage, isEmpty, logger, truncateId } from '../../../../utils/index.js'
import { OCPP20ServiceUtils } from '../../index.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  mapOCPP20AuthorizationStatus,
  mapOCPP20TokenType,
  mapToOCPP20Status,
  mapToOCPP20TokenType,
} from '../types/AuthTypes.js'

const moduleName = 'OCPP20AuthAdapter'

/**
 * OCPP 2.0 Authentication Adapter
 *
 * Handles authentication for OCPP 2.0/2.1 charging stations by translating
 * between auth types and OCPP 2.0 specific types and protocols.
 */
export class OCPP20AuthAdapter implements OCPPAuthAdapter<OCPP20IdTokenType> {
  readonly ocppVersion = OCPPVersion.VERSION_201

  constructor (private readonly chargingStation: ChargingStation) {}

  /**
   * Perform remote authorization using OCPP 2.0 Authorize request.
   * @param identifier - Identifier containing the IdToken to authorize
   * @param connectorId - EVSE/connector ID for the authorization context
   * @param transactionId - Optional existing transaction ID for ongoing transactions
   * @returns Authorization result with status, method, and OCPP 2.0 specific metadata
   */
  async authorizeRemote (
    identifier: Identifier,
    connectorId?: number,
    transactionId?: number | string
  ): Promise<AuthorizationResult> {
    const methodName = 'authorizeRemote'

    try {
      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorizing identifier '${truncateId(identifier.value)}' via OCPP 2.0 Authorize`
      )

      const isRemoteAuth = this.isRemoteAvailable()
      if (!isRemoteAuth) {
        return {
          additionalInfo: {
            connectorId,
            error: 'Remote authorization not available',
            transactionId,
          },
          isOffline: false,
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status: AuthorizationStatus.INVALID,
          timestamp: new Date(),
        }
      }

      const idToken = this.convertFromIdentifier(identifier)

      const isValidToken = this.isValidIdentifier(identifier)
      if (!isValidToken) {
        return {
          additionalInfo: {
            connectorId,
            error: 'Invalid token format for OCPP 2.0',
            transactionId,
          },
          isOffline: false,
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status: AuthorizationStatus.INVALID,
          timestamp: new Date(),
        }
      }

      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Sending Authorize request (idToken: ${idToken.idToken})`
      )

      const response = await this.chargingStation.ocppRequestService.requestHandler<
        OCPP20AuthorizeRequest,
        OCPP20AuthorizeResponse
      >(this.chargingStation, OCPP20RequestCommand.AUTHORIZE, {
        idToken,
      })

      const authStatus = response.idTokenInfo.status
      const cacheExpiryDateTime = response.idTokenInfo.cacheExpiryDateTime

      const mappedStatus = mapOCPP20AuthorizationStatus(authStatus)

      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorization result for ${idToken.idToken}: ${authStatus} (mapped: ${mappedStatus})`
      )

      return {
        additionalInfo: {
          cacheExpiryDateTime,
          chargingPriority: response.idTokenInfo.chargingPriority,
          connectorId,
          ocpp20Status: authStatus,
          tokenType: idToken.type,
          tokenValue: idToken.idToken,
        },
        isOffline: false,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: mappedStatus,
        timestamp: new Date(),
      }
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Remote authorization failed`,
        error
      )

      return {
        additionalInfo: {
          connectorId,
          error: getErrorMessage(error),
          transactionId,
        },
        isOffline: false,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: AuthorizationStatus.INVALID,
        timestamp: new Date(),
      }
    }
  }

  /**
   * Convert identifier to OCPP 2.0 IdToken
   * @param identifier - Identifier to convert to OCPP 2.0 format
   * @returns OCPP 2.0 IdTokenType with mapped type and additionalInfo
   */
  convertFromIdentifier (identifier: Identifier): OCPP20IdTokenType {
    // Map type back to OCPP 2.0 type
    const ocpp20Type = mapToOCPP20TokenType(identifier.type)

    // Convert additionalInfo back to OCPP 2.0 format
    const additionalInfo: AdditionalInfoType[] | undefined = identifier.additionalInfo
      ? Object.entries(identifier.additionalInfo)
        .filter(([key]) => key.startsWith('info_'))
        .map(([, value]) => {
          try {
            return JSON.parse(value) as AdditionalInfoType
          } catch {
            // Fallback for non-JSON values
            return {
              additionalIdToken: value,
              type: 'string',
            } as AdditionalInfoType
          }
        })
      : undefined

    return {
      additionalInfo,
      idToken: identifier.value,
      type: ocpp20Type,
    }
  }

  /**
   * Convert OCPP 2.0 IdToken to identifier
   * @param identifier - OCPP 2.0 IdToken or raw string identifier
   * @param additionalData - Optional metadata to include in the identifier
   * @returns Identifier with normalized type and metadata
   */
  convertToIdentifier (
    identifier: OCPP20IdTokenType | string,
    additionalData?: Record<string, unknown>
  ): Identifier {
    let idToken: OCPP20IdTokenType

    // Handle both string and object formats
    if (typeof identifier === 'string') {
      // Default to Central type for string identifiers
      idToken = {
        idToken: identifier,
        type: OCPP20IdTokenEnumType.Central,
      }
    } else {
      idToken = identifier
    }

    const identifierType = mapOCPP20TokenType(idToken.type)

    return {
      additionalInfo: {
        ocpp20Type: idToken.type,
        ...(idToken.additionalInfo
          ? Object.fromEntries(
            idToken.additionalInfo.map((item, index) => [
                `info_${String(index)}`,
                JSON.stringify(item),
            ])
          )
          : {}),
        ...(additionalData
          ? Object.fromEntries(Object.entries(additionalData).map(([k, v]) => [k, String(v)]))
          : {}),
      },
      parentId: additionalData?.parentId as string | undefined,
      type: identifierType,
      value: idToken.idToken,
    }
  }

  /**
   * Convert authorization result to OCPP 2.0 response format
   * @param result - Authorization result to convert
   * @returns OCPP 2.0 RequestStartStopStatusEnumType for transaction responses
   */
  convertToOCPP20Response (result: AuthorizationResult): RequestStartStopStatusEnumType {
    return mapToOCPP20Status(result.status)
  }

  /**
   * Create authorization request from OCPP 2.0 context
   * @param idTokenOrString - OCPP 2.0 IdToken or raw string identifier
   * @param connectorId - Optional EVSE/connector ID for the request
   * @param transactionId - Optional transaction ID for ongoing transactions
   * @param context - Optional context string (e.g., 'start', 'stop', 'remote_start')
   * @returns AuthRequest with identifier, context, and station metadata
   */
  createAuthRequest (
    idTokenOrString: OCPP20IdTokenType | string,
    connectorId?: number,
    transactionId?: string,
    context?: string
  ): AuthRequest {
    const identifier = this.convertToIdentifier(idTokenOrString)

    // Map context string to AuthContext enum
    let authContext: AuthContext
    switch (context?.toLowerCase()) {
      case 'ended':
      case 'stop':
      case 'transaction_stop':
        authContext = AuthContext.TRANSACTION_STOP
        break
      case 'remote_start':
        authContext = AuthContext.REMOTE_START
        break
      case 'remote_stop':
        authContext = AuthContext.REMOTE_STOP
        break
      case 'start':
      case 'started':
      case 'transaction_start':
        authContext = AuthContext.TRANSACTION_START
        break
      default:
        authContext = AuthContext.TRANSACTION_START
    }

    return {
      allowOffline: this.getOfflineAuthorizationConfig(),
      connectorId,
      context: authContext,
      identifier,
      metadata: {
        ocppVersion: OCPPVersion.VERSION_201,
        stationId: this.chargingStation.stationInfo?.chargingStationId,
      },
      timestamp: new Date(),
      transactionId,
    }
  }

  /**
   * Get OCPP 2.0 specific configuration schema
   * @returns Configuration schema object for OCPP 2.0 authorization settings
   */
  getConfigurationSchema (): JsonObject {
    return {
      properties: {
        authCacheEnabled: {
          description: 'Enable authorization cache',
          type: 'boolean',
        },
        authorizationTimeout: {
          description: 'Authorization timeout in seconds',
          minimum: 1,
          type: 'number',
        },
        // OCPP 2.0 specific variables
        authorizeRemoteStart: {
          description: 'Enable remote authorization via RequestStartTransaction',
          type: 'boolean',
        },
        certificateValidation: {
          description: 'Enable certificate-based validation',
          type: 'boolean',
        },
        localAuthorizeOffline: {
          description: 'Enable local authorization when offline',
          type: 'boolean',
        },
        localPreAuthorize: {
          description: 'Enable local pre-authorization',
          type: 'boolean',
        },
        stopTxOnInvalidId: {
          description: 'Stop transaction on invalid ID token',
          type: 'boolean',
        },
      },
      required: ['authorizeRemoteStart', 'localAuthorizeOffline'],
      type: 'object',
    }
  }

  /**
   * Get adapter-specific status information
   * @returns Status object containing adapter state and capabilities
   */
  getStatus (): JsonObject {
    return {
      isOnline: this.chargingStation.inAcceptedState(),
      localAuthEnabled: true, // Configuration dependent
      ocppVersion: this.ocppVersion,
      remoteAuthEnabled: true, // Always available in OCPP 2.0
      stationId: this.chargingStation.stationInfo?.chargingStationId,
      supportsIdTokenTypes: [
        OCPP20IdTokenEnumType.Central,
        OCPP20IdTokenEnumType.eMAID,
        OCPP20IdTokenEnumType.ISO14443,
        OCPP20IdTokenEnumType.ISO15693,
        OCPP20IdTokenEnumType.KeyCode,
        OCPP20IdTokenEnumType.Local,
        OCPP20IdTokenEnumType.MacAddress,
      ],
    }
  }

  /**
   * Check if remote authorization is available for OCPP 2.0
   * @returns True if remote authorization is available and enabled
   */
  isRemoteAvailable (): boolean {
    try {
      const isOnline = this.chargingStation.inAcceptedState()
      const remoteStartEnabled = OCPP20ServiceUtils.readVariableAsBoolean(
        this.chargingStation,
        OCPP20ComponentName.AuthCtrlr,
        OCPP20RequiredVariableName.AuthorizeRemoteStart,
        true
      )
      return isOnline && remoteStartEnabled
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.isRemoteAvailable: Error checking remote authorization availability`,
        error
      )
      return false
    }
  }

  /**
   * Check if identifier is valid for OCPP 2.0
   * @param identifier - Identifier to validate against OCPP 2.0 rules
   * @returns True if identifier meets OCPP 2.0 format requirements (max 36 chars, valid type)
   */
  isValidIdentifier (identifier: Identifier): boolean {
    // OCPP 2.0 idToken validation
    if (!identifier.value || typeof identifier.value !== 'string') {
      return false
    }

    // Check length (OCPP 2.0 spec: max 36 characters)
    if (isEmpty(identifier.value) || identifier.value.length > 36) {
      return false
    }

    // OCPP 2.0 supports multiple identifier types
    const validTypes = [
      IdentifierType.ID_TAG,
      IdentifierType.CENTRAL,
      IdentifierType.LOCAL,
      IdentifierType.ISO14443,
      IdentifierType.ISO15693,
      IdentifierType.KEY_CODE,
      IdentifierType.E_MAID,
      IdentifierType.MAC_ADDRESS,
      IdentifierType.NO_AUTHORIZATION,
    ]

    return validTypes.includes(identifier.type)
  }

  /**
   * Validate adapter configuration for OCPP 2.0
   * @param config - Authentication configuration to validate
   * @returns Promise resolving to true if configuration is valid for OCPP 2.0 operations
   */
  validateConfiguration (config: AuthConfiguration): boolean {
    try {
      // Check that at least one authorization method is enabled
      const hasRemoteAuth = config.remoteAuthorization === true
      const hasLocalAuth = config.offlineAuthorizationEnabled
      const hasCertAuth = config.certificateAuthEnabled

      if (!hasRemoteAuth && !hasLocalAuth && !hasCertAuth) {
        logger.warn(
          `${this.chargingStation.logPrefix()} ${moduleName}.validateConfiguration: No authorization methods enabled`
        )
        return false
      }

      // Validate timeout values
      if (config.authorizationTimeout < 1) {
        logger.warn(
          `${this.chargingStation.logPrefix()} ${moduleName}.validateConfiguration: Invalid authorization timeout`
        )
        return false
      }

      return true
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.validateConfiguration: Configuration validation failed`,
        error
      )
      return false
    }
  }

  /**
   * Check if offline authorization is allowed
   * @returns True if offline authorization is enabled
   */
  private getOfflineAuthorizationConfig (): boolean {
    try {
      return OCPP20ServiceUtils.readVariableAsBoolean(
        this.chargingStation,
        OCPP20ComponentName.AuthCtrlr,
        OCPP20RequiredVariableName.LocalAuthorizationOffline,
        true
      )
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.getOfflineAuthorizationConfig: Error getting offline authorization config`,
        error
      )
      return false
    }
  }
}
