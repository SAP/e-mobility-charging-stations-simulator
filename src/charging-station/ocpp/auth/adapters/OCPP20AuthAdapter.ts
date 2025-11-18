import type { ChargingStation } from '../../../index.js'
import type { OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

import { type OCPP20IdTokenType, RequestStartStopStatusEnumType } from '../../../../types/index.js'
import {
  type AdditionalInfoType,
  OCPP20IdTokenEnumType,
} from '../../../../types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import { logger } from '../../../../utils/index.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  mapToOCPP20Status,
} from '../types/AuthTypes.js'

const moduleName = 'OCPP20AuthAdapter'

/**
 * OCPP 2.0 Authentication Adapter
 *
 * Handles authentication for OCPP 2.0/2.1 charging stations by translating
 * between unified auth types and OCPP 2.0 specific types and protocols.
 *
 * Note: OCPP 2.0 doesn't have a dedicated Authorize message. Authorization
 * happens through TransactionEvent messages and local configuration.
 */
export class OCPP20AuthAdapter implements OCPPAuthAdapter {
  readonly ocppVersion = OCPPVersion.VERSION_20

  constructor (private readonly chargingStation: ChargingStation) {}

  /**
   * Perform remote authorization using OCPP 2.0 mechanisms
   *
   * Since OCPP 2.0 doesn't have Authorize, we simulate authorization
   * by checking if we can start a transaction with the identifier
   * @param identifier
   * @param connectorId
   * @param transactionId
   */
  async authorizeRemote (
    identifier: UnifiedIdentifier,
    connectorId?: number,
    transactionId?: number | string
  ): Promise<AuthorizationResult> {
    const methodName = 'authorizeRemote'

    try {
      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorizing identifier ${identifier.value} via OCPP 2.0`
      )

      // For OCPP 2.0, we need to check authorization through configuration
      // since there's no explicit Authorize message

      // Check if remote authorization is configured
      const isRemoteAuth = await this.isRemoteAvailable()
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

      // For OCPP 2.0, we check authorization through local cache/validation
      // since there's no explicit Authorize message like in OCPP 1.6
      if (connectorId != null) {
        try {
          const idToken = this.convertFromUnifiedIdentifier(identifier)

          // In OCPP 2.0, authorization is typically handled through:
          // 1. Local authorization cache
          // 2. Authorization lists
          // 3. Transaction events (implicit authorization)

          // For now, we'll simulate authorization check based on token validity
          // and station configuration. A real implementation would:
          // - Check local authorization cache
          // - Validate against local authorization lists
          // - Check certificate-based authorization if enabled

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

          // In a real implementation, this would check the authorization cache
          // or local authorization list maintained by the charging station
          return {
            additionalInfo: {
              connectorId,
              note: 'OCPP 2.0 authorization through local validation',
              tokenType: idToken.type,
              tokenValue: idToken.idToken,
            },
            isOffline: false,
            method: AuthenticationMethod.REMOTE_AUTHORIZATION,
            status: AuthorizationStatus.ACCEPTED,
            timestamp: new Date(),
          }
        } catch (error) {
          logger.error(
            `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorization check failed`,
            error
          )

          return {
            additionalInfo: {
              connectorId,
              error: error instanceof Error ? error.message : 'Unknown error',
              transactionId,
            },
            isOffline: false,
            method: AuthenticationMethod.REMOTE_AUTHORIZATION,
            status: AuthorizationStatus.INVALID,
            timestamp: new Date(),
          }
        }
      }

      // If no connector specified, assume authorization is valid
      // This is a simplified approach for OCPP 2.0
      return {
        additionalInfo: {
          connectorId,
          note: 'OCPP 2.0 authorization check without specific connector',
          transactionId,
        },
        isOffline: false,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: AuthorizationStatus.ACCEPTED,
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
          error: error instanceof Error ? error.message : 'Unknown error',
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
   * Convert unified identifier to OCPP 2.0 IdToken
   * @param identifier
   */
  convertFromUnifiedIdentifier (identifier: UnifiedIdentifier): OCPP20IdTokenType {
    // Map unified type back to OCPP 2.0 type
    const ocpp20Type = this.mapFromUnifiedIdentifierType(identifier.type)

    // Convert unified additionalInfo back to OCPP 2.0 format
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
   * Convert unified authorization result to OCPP 2.0 response format
   * @param result
   */
  convertToOCPP20Response (result: AuthorizationResult): RequestStartStopStatusEnumType {
    return mapToOCPP20Status(result.status)
  }

  /**
   * Convert OCPP 2.0 IdToken to unified identifier
   * @param identifier
   * @param additionalData
   */
  convertToUnifiedIdentifier (
    identifier: OCPP20IdTokenType | string,
    additionalData?: Record<string, unknown>
  ): UnifiedIdentifier {
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

    // Map OCPP 2.0 IdToken type to unified type
    const unifiedType = this.mapToUnifiedIdentifierType(idToken.type)

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
      ocppVersion: OCPPVersion.VERSION_20,
      parentId: additionalData?.parentId as string | undefined,
      type: unifiedType,
      value: idToken.idToken,
    }
  }

  /**
   * Create authorization request from OCPP 2.0 context
   * @param idTokenOrString
   * @param connectorId
   * @param transactionId
   * @param context
   */
  createAuthRequest (
    idTokenOrString: OCPP20IdTokenType | string,
    connectorId?: number,
    transactionId?: string,
    context?: string
  ): AuthRequest {
    const identifier = this.convertToUnifiedIdentifier(idTokenOrString)

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
        ocppVersion: OCPPVersion.VERSION_20,
        stationId: this.chargingStation.stationInfo?.chargingStationId,
      },
      timestamp: new Date(),
      transactionId,
    }
  }

  /**
   * Get OCPP 2.0 specific configuration schema
   */
  getConfigurationSchema (): Record<string, unknown> {
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
   */
  getStatus (): Record<string, unknown> {
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
   */
  async isRemoteAvailable (): Promise<boolean> {
    try {
      // Check if station supports remote authorization via variables
      // OCPP 2.0 uses variables instead of configuration keys

      // Check if station is online and can communicate
      const isOnline = this.chargingStation.inAcceptedState()

      // Check AuthorizeRemoteStart variable
      const remoteStartEnabled = await this.getVariableValue('AuthCtrlr', 'AuthorizeRemoteStart')

      return isOnline && remoteStartEnabled === 'true'
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Error checking remote authorization availability`,
        error
      )
      return false
    }
  }

  /**
   * Check if identifier is valid for OCPP 2.0
   * @param identifier
   */
  isValidIdentifier (identifier: UnifiedIdentifier): boolean {
    // OCPP 2.0 idToken validation
    if (!identifier.value || typeof identifier.value !== 'string') {
      return false
    }

    // Check length (OCPP 2.0 spec: max 36 characters)
    if (identifier.value.length === 0 || identifier.value.length > 36) {
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
    ]

    return validTypes.includes(identifier.type)
  }

  /**
   * Validate adapter configuration for OCPP 2.0
   * @param config
   */
  validateConfiguration (config: AuthConfiguration): Promise<boolean> {
    try {
      // Check that at least one authorization method is enabled
      const hasRemoteAuth = config.authorizeRemoteStart === true
      const hasLocalAuth = config.localAuthorizeOffline === true
      const hasCertAuth = config.certificateValidation === true

      if (!hasRemoteAuth && !hasLocalAuth && !hasCertAuth) {
        logger.warn(
          `${this.chargingStation.logPrefix()} OCPP 2.0 adapter: No authorization methods enabled`
        )
        return Promise.resolve(false)
      }

      // Validate timeout values
      if (config.authorizationTimeout < 1) {
        logger.warn(
          `${this.chargingStation.logPrefix()} OCPP 2.0 adapter: Invalid authorization timeout`
        )
        return Promise.resolve(false)
      }

      return Promise.resolve(true)
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} OCPP 2.0 adapter configuration validation failed`,
        error
      )
      return Promise.resolve(false)
    }
  }

  /**
   * Check if offline authorization is allowed
   */
  private getOfflineAuthorizationConfig (): boolean {
    try {
      // In OCPP 2.0, this would be controlled by LocalAuthorizeOffline variable
      // For now, return a default value
      return true
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Error getting offline authorization config`,
        error
      )
      return false
    }
  }

  /**
   * Get OCPP 2.0 variable value
   * @param component
   * @param variable
   */
  private getVariableValue (component: string, variable: string): Promise<string | undefined> {
    try {
      // This is a simplified implementation - you might need to implement
      // proper variable access based on your OCPP 2.0 implementation
      // For now, return default values or use configuration fallback

      if (component === 'AuthCtrlr' && variable === 'AuthorizeRemoteStart') {
        return Promise.resolve('true') // Default to enabled
      }

      return Promise.resolve(undefined)
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Error getting variable ${component}.${variable}`,
        error
      )
      return Promise.resolve(undefined)
    }
  }

  /**
   * Map unified identifier type to OCPP 2.0 IdToken type
   * @param unifiedType
   */
  private mapFromUnifiedIdentifierType (unifiedType: IdentifierType): OCPP20IdTokenEnumType {
    switch (unifiedType) {
      case IdentifierType.CENTRAL:
        return OCPP20IdTokenEnumType.Central
      case IdentifierType.E_MAID:
        return OCPP20IdTokenEnumType.eMAID
      case IdentifierType.ID_TAG:
        return OCPP20IdTokenEnumType.Local
      case IdentifierType.ISO14443:
        return OCPP20IdTokenEnumType.ISO14443
      case IdentifierType.ISO15693:
        return OCPP20IdTokenEnumType.ISO15693
      case IdentifierType.KEY_CODE:
        return OCPP20IdTokenEnumType.KeyCode
      case IdentifierType.LOCAL:
        return OCPP20IdTokenEnumType.Local
      case IdentifierType.MAC_ADDRESS:
        return OCPP20IdTokenEnumType.MacAddress
      case IdentifierType.NO_AUTHORIZATION:
        return OCPP20IdTokenEnumType.NoAuthorization
      default:
        return OCPP20IdTokenEnumType.Central
    }
  }

  /**
   * Map OCPP 2.0 IdToken type to unified identifier type
   * @param ocpp20Type
   */
  private mapToUnifiedIdentifierType (ocpp20Type: OCPP20IdTokenEnumType): IdentifierType {
    switch (ocpp20Type) {
      case OCPP20IdTokenEnumType.Central:
      case OCPP20IdTokenEnumType.Local:
        return IdentifierType.ID_TAG
      case OCPP20IdTokenEnumType.eMAID:
        return IdentifierType.E_MAID
      case OCPP20IdTokenEnumType.ISO14443:
        return IdentifierType.ISO14443
      case OCPP20IdTokenEnumType.ISO15693:
        return IdentifierType.ISO15693
      case OCPP20IdTokenEnumType.KeyCode:
        return IdentifierType.KEY_CODE
      case OCPP20IdTokenEnumType.MacAddress:
        return IdentifierType.MAC_ADDRESS
      case OCPP20IdTokenEnumType.NoAuthorization:
        return IdentifierType.NO_AUTHORIZATION
      default:
        return IdentifierType.ID_TAG
    }
  }
}
