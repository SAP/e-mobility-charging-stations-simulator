import type { ChargingStation } from '../../../../charging-station/index.js'
import type { OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

import { getConfigurationKey } from '../../../../charging-station/ConfigurationKeyUtils.js'
import {
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  RequestCommand,
  StandardParametersKey,
} from '../../../../types/index.js'
import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import { logger } from '../../../../utils/index.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  mapOCPP16Status,
  mapToOCPP16Status,
} from '../types/AuthTypes.js'
import { AuthValidators } from '../utils/AuthValidators.js'

const moduleName = 'OCPP16AuthAdapter'

/**
 * OCPP 1.6 Authentication Adapter
 *
 * Handles authentication for OCPP 1.6 charging stations by translating
 * between unified auth types and OCPP 1.6 specific types and protocols.
 */
export class OCPP16AuthAdapter implements OCPPAuthAdapter {
  readonly ocppVersion = OCPPVersion.VERSION_16

  constructor (private readonly chargingStation: ChargingStation) {}

  /**
   * Perform remote authorization using OCPP 1.6 Authorize message
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
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorizing identifier ${identifier.value} via OCPP 1.6`
      )

      // Mark connector as authorizing if provided
      if (connectorId != null) {
        const connectorStatus = this.chargingStation.getConnectorStatus(connectorId)
        if (connectorStatus != null) {
          connectorStatus.authorizeIdTag = identifier.value
        }
      }

      // Send OCPP 1.6 Authorize request
      const response = await this.chargingStation.ocppRequestService.requestHandler<
        OCPP16AuthorizeRequest,
        OCPP16AuthorizeResponse
      >(this.chargingStation, RequestCommand.AUTHORIZE, {
        idTag: identifier.value,
      })

      // Convert response to unified format
      const result: AuthorizationResult = {
        additionalInfo: {
          connectorId,
          ocpp16Status: response.idTagInfo.status,
          transactionId,
        },
        expiryDate: response.idTagInfo.expiryDate,
        isOffline: false,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        parentId: response.idTagInfo.parentIdTag,
        status: mapOCPP16Status(response.idTagInfo.status),
        timestamp: new Date(),
      }

      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Remote authorization result: ${result.status}`
      )

      return result
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Remote authorization failed`,
        error
      )

      // Return failed authorization result
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
   * Convert unified identifier to OCPP 1.6 idTag string
   * @param identifier
   */
  convertFromUnifiedIdentifier (identifier: UnifiedIdentifier): string {
    // For OCPP 1.6, we always return the string value
    return identifier.value
  }

  /**
   * Convert unified authorization result to OCPP 1.6 response format
   * @param result
   */
  convertToOCPP16Response (result: AuthorizationResult): OCPP16AuthorizeResponse {
    return {
      idTagInfo: {
        expiryDate: result.expiryDate,
        parentIdTag: result.parentId,
        status: mapToOCPP16Status(result.status),
      },
    }
  }

  /**
   * Convert OCPP 1.6 idTag to unified identifier
   * @param identifier
   * @param additionalData
   */
  convertToUnifiedIdentifier (
    identifier: string,
    additionalData?: Record<string, unknown>
  ): UnifiedIdentifier {
    return {
      additionalInfo: additionalData
        ? Object.fromEntries(Object.entries(additionalData).map(([k, v]) => [k, String(v)]))
        : undefined,
      ocppVersion: OCPPVersion.VERSION_16,
      parentId: additionalData?.parentId as string | undefined,
      type: IdentifierType.ID_TAG,
      value: identifier,
    }
  }

  /**
   * Create authorization request from OCPP 1.6 context
   * @param idTag
   * @param connectorId
   * @param transactionId
   * @param context
   */
  createAuthRequest (
    idTag: string,
    connectorId?: number,
    transactionId?: number,
    context?: string
  ): AuthRequest {
    const identifier = this.convertToUnifiedIdentifier(idTag)

    // Map context string to AuthContext enum
    let authContext: AuthContext
    switch (context?.toLowerCase()) {
      case 'remote_start':
        authContext = AuthContext.REMOTE_START
        break
      case 'remote_stop':
        authContext = AuthContext.REMOTE_STOP
        break
      case 'start':
      case 'transaction_start':
        authContext = AuthContext.TRANSACTION_START
        break
      case 'stop':
      case 'transaction_stop':
        authContext = AuthContext.TRANSACTION_STOP
        break
      default:
        authContext = AuthContext.TRANSACTION_START
    }

    return {
      allowOffline: this.getOfflineTransactionConfig(),
      connectorId,
      context: authContext,
      identifier,
      metadata: {
        ocppVersion: OCPPVersion.VERSION_16,
        stationId: this.chargingStation.stationInfo?.chargingStationId,
      },
      timestamp: new Date(),
      transactionId: transactionId?.toString(),
    }
  }

  /**
   * Get OCPP 1.6 specific configuration schema
   */
  getConfigurationSchema (): Record<string, unknown> {
    return {
      properties: {
        allowOfflineTxForUnknownId: {
          description: 'Allow offline transactions for unknown IDs',
          type: 'boolean',
        },
        authorizationCacheEnabled: {
          description: 'Enable authorization cache',
          type: 'boolean',
        },
        authorizationKey: {
          description: 'Authorization key for local list management',
          type: 'string',
        },
        authorizationTimeout: {
          description: 'Authorization timeout in seconds',
          minimum: 1,
          type: 'number',
        },
        // OCPP 1.6 specific configuration keys
        localAuthListEnabled: {
          description: 'Enable local authorization list',
          type: 'boolean',
        },
        localPreAuthorize: {
          description: 'Enable local pre-authorization',
          type: 'boolean',
        },
        remoteAuthorization: {
          description: 'Enable remote authorization via Authorize message',
          type: 'boolean',
        },
      },
      required: ['localAuthListEnabled', 'remoteAuthorization'],
      type: 'object',
    }
  }

  /**
   * Get adapter-specific status information
   */
  getStatus (): Record<string, unknown> {
    return {
      isOnline: this.chargingStation.inAcceptedState(),
      localAuthEnabled: this.chargingStation.getLocalAuthListEnabled(),
      ocppVersion: this.ocppVersion,
      remoteAuthEnabled: this.chargingStation.stationInfo?.remoteAuthorization === true,
      stationId: this.chargingStation.stationInfo?.chargingStationId,
    }
  }

  /**
   * Check if remote authorization is available
   */
  isRemoteAvailable (): Promise<boolean> {
    try {
      // Check if station supports remote authorization
      const remoteAuthEnabled = this.chargingStation.stationInfo?.remoteAuthorization === true

      // Check if station is online and can communicate
      const isOnline = this.chargingStation.inAcceptedState()

      return Promise.resolve(remoteAuthEnabled && isOnline)
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Error checking remote authorization availability`,
        error
      )
      return Promise.resolve(false)
    }
  }

  /**
   * Check if identifier is valid for OCPP 1.6
   * @param identifier
   */
  isValidIdentifier (identifier: UnifiedIdentifier): boolean {
    // OCPP 1.6 idTag validation
    if (!identifier.value || typeof identifier.value !== 'string') {
      return false
    }

    // Check length (OCPP 1.6 spec: max 20 characters)
    if (
      identifier.value.length === 0 ||
      identifier.value.length > AuthValidators.MAX_IDTAG_LENGTH
    ) {
      return false
    }

    // Only ID_TAG type is supported in OCPP 1.6
    if (identifier.type !== IdentifierType.ID_TAG) {
      return false
    }

    return true
  }

  /**
   * Validate adapter configuration for OCPP 1.6
   * @param config
   */
  validateConfiguration (config: AuthConfiguration): Promise<boolean> {
    try {
      // Check that at least one authorization method is enabled
      const hasLocalAuth = config.localAuthListEnabled
      const hasRemoteAuth = config.remoteAuthorization

      if (!hasLocalAuth && !hasRemoteAuth) {
        logger.warn(
          `${this.chargingStation.logPrefix()} OCPP 1.6 adapter: No authorization methods enabled`
        )
        return Promise.resolve(false)
      }

      // Validate timeout values
      if (config.authorizationTimeout < 1) {
        logger.warn(
          `${this.chargingStation.logPrefix()} OCPP 1.6 adapter: Invalid authorization timeout`
        )
        return Promise.resolve(false)
      }

      return Promise.resolve(true)
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} OCPP 1.6 adapter configuration validation failed`,
        error
      )
      return Promise.resolve(false)
    }
  }

  /**
   * Check if offline transactions are allowed for unknown IDs
   */
  private getOfflineTransactionConfig (): boolean {
    try {
      const configKey = getConfigurationKey(
        this.chargingStation,
        StandardParametersKey.AllowOfflineTxForUnknownId
      )
      return configKey?.value === 'true'
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Error getting offline transaction config`,
        error
      )
      return false
    }
  }
}
