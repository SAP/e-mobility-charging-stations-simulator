import type { ChargingStation } from '../../../index.js'
import type { OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

import { OCPP20ServiceUtils } from '../../2.0/OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from '../../2.0/OCPP20VariableManager.js'
import {
  GetVariableStatusEnumType,
  type OCPP20IdTokenType,
  RequestStartStopStatusEnumType,
} from '../../../../types/index.js'
import {
  type AdditionalInfoType,
  OCPP20AuthorizationStatusEnumType,
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventResponse,
  OCPP20TriggerReasonEnumType,
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
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorizing identifier ${identifier.value} via OCPP 2.0 TransactionEvent`
      )

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

      // Validate inputs
      if (connectorId == null) {
        logger.warn(
          `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: No connector specified for authorization`
        )
        return {
          additionalInfo: {
            error: 'Connector ID is required for OCPP 2.0 authorization',
          },
          isOffline: false,
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status: AuthorizationStatus.INVALID,
          timestamp: new Date(),
        }
      }

      try {
        const idToken = this.convertFromUnifiedIdentifier(identifier)

        // Validate token format
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

        // OCPP 2.0: Authorization through TransactionEvent
        // According to OCPP 2.0.1 spec section G03 - Authorization
        const tempTransactionId =
          transactionId != null ? transactionId.toString() : `auth-${Date.now().toString()}`

        // Get EVSE ID from connector
        const evseId = connectorId // In OCPP 2.0, connector maps to EVSE

        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Sending TransactionEvent for authorization (evseId: ${evseId.toString()}, idToken: ${idToken.idToken})`
        )

        // Send TransactionEvent with idToken to request authorization
        const response: OCPP20TransactionEventResponse =
          await OCPP20ServiceUtils.sendTransactionEvent(
            this.chargingStation,
            OCPP20TransactionEventEnumType.Started,
            OCPP20TriggerReasonEnumType.Authorized,
            connectorId,
            tempTransactionId,
            {
              evseId,
              idToken,
            }
          )

        // Extract authorization status from response
        const authStatus = response.idTokenInfo?.status
        const cacheExpiryDateTime = response.idTokenInfo?.cacheExpiryDateTime

        if (authStatus == null) {
          logger.warn(
            `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: No idTokenInfo in TransactionEvent response, treating as Unknown`
          )
          return {
            additionalInfo: {
              connectorId,
              note: 'No authorization status in response',
              transactionId: tempTransactionId,
            },
            isOffline: false,
            method: AuthenticationMethod.REMOTE_AUTHORIZATION,
            status: AuthorizationStatus.UNKNOWN,
            timestamp: new Date(),
          }
        }

        // Map OCPP 2.0 authorization status to unified status
        const unifiedStatus = this.mapOCPP20AuthStatus(authStatus)

        logger.info(
          `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorization result for ${idToken.idToken}: ${authStatus} (unified: ${unifiedStatus})`
        )

        return {
          additionalInfo: {
            cacheExpiryDateTime,
            chargingPriority: response.idTokenInfo?.chargingPriority,
            connectorId,
            ocpp20Status: authStatus,
            tokenType: idToken.type,
            tokenValue: idToken.idToken,
            transactionId: tempTransactionId,
          },
          isOffline: false,
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status: unifiedStatus,
          timestamp: new Date(),
        }
      } catch (error) {
        logger.error(
          `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: TransactionEvent authorization failed`,
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

      // Check AuthorizeRemoteStart variable (with type validation)
      const remoteStartValue = await this.getVariableValue('AuthCtrlr', 'AuthorizeRemoteStart')
      const remoteStartEnabled = this.parseBooleanVariable(remoteStartValue, true)

      return isOnline && remoteStartEnabled
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
   * Get default variable value based on OCPP 2.0.1 specification
   * @param component - Component name
   * @param variable - Variable name
   * @param useFallback - Whether to return fallback values
   * @returns Default value according to OCPP 2.0.1 spec, or undefined
   */
  private getDefaultVariableValue (
    component: string,
    variable: string,
    useFallback: boolean
  ): string | undefined {
    if (!useFallback) {
      return undefined
    }

    // Default values from OCPP 2.0.1 specification and variable registry
    if (component === 'AuthCtrlr') {
      switch (variable) {
        case 'AuthorizeRemoteStart':
          return 'true' // OCPP 2.0.1 default: remote start requires authorization
        case 'Enabled':
          return 'true' // Default: authorization is enabled
        case 'LocalAuthListEnabled':
          return 'true' // Default: enable local auth list
        case 'LocalAuthorizeOffline':
          return 'true' // OCPP 2.0.1 default: allow offline authorization
        case 'LocalPreAuthorize':
          return 'false' // OCPP 2.0.1 default: wait for CSMS authorization
        default:
          return undefined
      }
    }

    return undefined
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
   * Get variable value from OCPP 2.0 variable system
   * @param component - Component name (e.g., 'AuthCtrlr')
   * @param variable - Variable name (e.g., 'AuthorizeRemoteStart')
   * @param useDefaultFallback - If true, use OCPP 2.0.1 spec default values when variable is not found
   * @returns Variable value as string, or undefined if not found
   */
  private getVariableValue (
    component: string,
    variable: string,
    useDefaultFallback = true
  ): Promise<string | undefined> {
    try {
      const variableManager = OCPP20VariableManager.getInstance()

      const results = variableManager.getVariables(this.chargingStation, [
        {
          component: { name: component },
          variable: { name: variable },
        },
      ])

      // Check if variable was successfully retrieved
      if (results.length === 0) {
        logger.debug(
          `${this.chargingStation.logPrefix()} Variable ${component}.${variable} not found in registry`
        )
        return Promise.resolve(
          this.getDefaultVariableValue(component, variable, useDefaultFallback)
        )
      }

      const result = results[0]

      // Check for errors or rejection
      if (
        result.attributeStatus !== GetVariableStatusEnumType.Accepted ||
        result.attributeValue == null
      ) {
        logger.debug(
          `${this.chargingStation.logPrefix()} Variable ${component}.${variable} not available: ${result.attributeStatus}`
        )
        return Promise.resolve(
          this.getDefaultVariableValue(component, variable, useDefaultFallback)
        )
      }

      return Promise.resolve(result.attributeValue)
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Error getting variable ${component}.${variable}`,
        error
      )
      return Promise.resolve(this.getDefaultVariableValue(component, variable, useDefaultFallback))
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
   * Maps OCPP 2.0 AuthorizationStatusEnumType to unified AuthorizationStatus
   * @param ocpp20Status - OCPP 2.0 authorization status
   * @returns Unified authorization status
   */
  private mapOCPP20AuthStatus (
    ocpp20Status: OCPP20AuthorizationStatusEnumType
  ): AuthorizationStatus {
    switch (ocpp20Status) {
      case OCPP20AuthorizationStatusEnumType.Accepted:
        return AuthorizationStatus.ACCEPTED
      case OCPP20AuthorizationStatusEnumType.Blocked:
        return AuthorizationStatus.BLOCKED
      case OCPP20AuthorizationStatusEnumType.ConcurrentTx:
        return AuthorizationStatus.CONCURRENT_TX
      case OCPP20AuthorizationStatusEnumType.Expired:
        return AuthorizationStatus.EXPIRED
      case OCPP20AuthorizationStatusEnumType.Invalid:
        return AuthorizationStatus.INVALID
      case OCPP20AuthorizationStatusEnumType.NoCredit:
        return AuthorizationStatus.NO_CREDIT
      case OCPP20AuthorizationStatusEnumType.NotAllowedTypeEVSE:
        return AuthorizationStatus.NOT_ALLOWED_TYPE_EVSE
      case OCPP20AuthorizationStatusEnumType.NotAtThisLocation:
        return AuthorizationStatus.NOT_AT_THIS_LOCATION
      case OCPP20AuthorizationStatusEnumType.NotAtThisTime:
        return AuthorizationStatus.NOT_AT_THIS_TIME
      case OCPP20AuthorizationStatusEnumType.Unknown:
      default:
        return AuthorizationStatus.UNKNOWN
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

  /**
   * Parse and validate a boolean variable value
   * @param value - String value to parse ('true', 'false', '1', '0')
   * @param defaultValue - Default value if parsing fails
   * @returns Parsed boolean value
   */
  private parseBooleanVariable (value: string | undefined, defaultValue: boolean): boolean {
    if (value == null) {
      return defaultValue
    }

    const normalized = value.toLowerCase().trim()

    if (normalized === 'true' || normalized === '1') {
      return true
    }

    if (normalized === 'false' || normalized === '0') {
      return false
    }

    logger.warn(
      `${this.chargingStation.logPrefix()} Invalid boolean value '${value}', using default: ${defaultValue.toString()}`
    )
    return defaultValue
  }

  /**
   * Parse and validate an integer variable value
   * @param value - String value to parse
   * @param defaultValue - Default value if parsing fails
   * @param min - Minimum allowed value (optional)
   * @param max - Maximum allowed value (optional)
   * @returns Parsed integer value
   */
  private parseIntegerVariable (
    value: string | undefined,
    defaultValue: number,
    min?: number,
    max?: number
  ): number {
    if (value == null) {
      return defaultValue
    }

    const parsed = parseInt(value, 10)

    if (isNaN(parsed)) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Invalid integer value '${value}', using default: ${defaultValue.toString()}`
      )
      return defaultValue
    }

    // Validate range
    if (min != null && parsed < min) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Integer value ${parsed.toString()} below minimum ${min.toString()}, using minimum`
      )
      return min
    }

    if (max != null && parsed > max) {
      logger.warn(
        `${this.chargingStation.logPrefix()} Integer value ${parsed.toString()} above maximum ${max.toString()}, using maximum`
      )
      return max
    }

    return parsed
  }
}
