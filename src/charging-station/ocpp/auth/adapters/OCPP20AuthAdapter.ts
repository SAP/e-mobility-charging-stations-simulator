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

import { OCPP20VariableManager } from '../../2.0/OCPP20VariableManager.js'
import {
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPPVersion,
} from '../../../../types/index.js'
import { logger, truncateId } from '../../../../utils/index.js'
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
  readonly ocppVersion = OCPPVersion.VERSION_20

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
        `${this.chargingStation.logPrefix()} ${moduleName}.${methodName}: Authorizing identifier ${truncateId(identifier.value)} via OCPP 2.0 Authorize`
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
        ocppVersion: OCPPVersion.VERSION_20,
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
      // Check if station supports remote authorization via variables
      // OCPP 2.0 uses variables instead of configuration keys

      // Check if station is online and can communicate
      const isOnline = this.chargingStation.inAcceptedState()

      // Check AuthorizeRemoteStart variable (with type validation)
      const remoteStartValue = this.getVariableValue(
        OCPP20ComponentName.AuthCtrlr,
        OCPP20RequiredVariableName.AuthorizeRemoteStart
      )
      const remoteStartEnabled = this.parseBooleanVariable(remoteStartValue, true)

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
   * Get default variable value based on OCPP 2.0.1 specification
   * @param component - OCPP component name (e.g., OCPP20ComponentName.AuthCtrlr)
   * @param variable - OCPP variable name (e.g., OCPP20RequiredVariableName.AuthorizeRemoteStart)
   * @param useFallback - Whether to return fallback values when variable is not configured
   * @returns Default value according to OCPP 2.0.1 spec, or undefined if no default exists
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
    if (component === (OCPP20ComponentName.AuthCtrlr as string)) {
      switch (variable) {
        case OCPP20RequiredVariableName.AuthorizeRemoteStart as string:
          return 'true'
        case OCPP20RequiredVariableName.Enabled as string:
          return 'true'
        case OCPP20RequiredVariableName.LocalAuthorizationOffline as string:
          return 'true'
        case OCPP20RequiredVariableName.LocalPreAuthorization as string:
          return 'false'
        default:
          return undefined
      }
    }

    if (component === (OCPP20ComponentName.LocalAuthListCtrlr as string)) {
      switch (variable) {
        case OCPP20RequiredVariableName.Enabled as string:
          return 'true'
        default:
          return undefined
      }
    }

    return undefined
  }

  /**
   * Check if offline authorization is allowed
   * @returns True if offline authorization is enabled
   */
  private getOfflineAuthorizationConfig (): boolean {
    try {
      const value = this.getVariableValue(
        OCPP20ComponentName.AuthCtrlr,
        OCPP20RequiredVariableName.LocalAuthorizationOffline
      )
      return this.parseBooleanVariable(value, true)
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.getOfflineAuthorizationConfig: Error getting offline authorization config`,
        error
      )
      return false
    }
  }

  /**
   * Get variable value from OCPP 2.0 variable system
   * @param component - OCPP component name (e.g., OCPP20ComponentName.AuthCtrlr)
   * @param variable - OCPP variable name (e.g., OCPP20RequiredVariableName.AuthorizeRemoteStart)
   * @param useDefaultFallback - If true, use OCPP 2.0.1 spec default values when variable is not found
   * @returns Promise resolving to variable value as string, or undefined if not available
   */
  private getVariableValue (
    component: string,
    variable: string,
    useDefaultFallback = true
  ): string | undefined {
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
          `${this.chargingStation.logPrefix()} ${moduleName}.getVariableValue: Variable ${component}.${variable} not found in registry`
        )
        return this.getDefaultVariableValue(component, variable, useDefaultFallback)
      }

      const result = results[0]

      // Check for errors or rejection
      if (
        result.attributeStatus !== GetVariableStatusEnumType.Accepted ||
        result.attributeValue == null
      ) {
        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.getVariableValue: Variable ${component}.${variable} not available: ${result.attributeStatus}`
        )
        return this.getDefaultVariableValue(component, variable, useDefaultFallback)
      }

      return result.attributeValue
    } catch (error) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.getVariableValue: Error getting variable ${component}.${variable}`,
        error
      )
      return this.getDefaultVariableValue(component, variable, useDefaultFallback)
    }
  }

  /**
   * Parse and validate a boolean variable value
   * @param value - String value to parse ('true', 'false', '1', '0')
   * @param defaultValue - Fallback value when parsing fails or value is undefined
   * @returns Parsed boolean value, or defaultValue if parsing fails
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
      `${this.chargingStation.logPrefix()} ${moduleName}.parseBooleanVariable: Invalid boolean value '${value}', using default: ${defaultValue.toString()}`
    )
    return defaultValue
  }
}
