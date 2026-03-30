import type { ChargingStation } from '../../charging-station/index.js'

import { logger } from '../../utils/index.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  OCPPAuthServiceFactory,
} from './auth/index.js'

export const isIdTagAuthorized = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag: string,
  context?: AuthContext
): Promise<boolean> => {
  try {
    logger.debug(
      `${chargingStation.logPrefix()} Authorizing idTag '${idTag}' on connector ${connectorId.toString()}`
    )

    const authService = OCPPAuthServiceFactory.getInstance(chargingStation)

    const authResult = await authService.authorize({
      allowOffline: false,
      connectorId,
      context: context ?? AuthContext.TRANSACTION_START,
      identifier: {
        type: IdentifierType.ID_TAG,
        value: idTag,
      },
      timestamp: new Date(),
    })

    logger.debug(
      `${chargingStation.logPrefix()} Authorization result for idTag '${idTag}': ${authResult.status} using ${authResult.method} method`
    )

    if (authResult.status === AuthorizationStatus.ACCEPTED) {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        switch (authResult.method) {
          case AuthenticationMethod.CACHE:
          case AuthenticationMethod.LOCAL_LIST:
          case AuthenticationMethod.OFFLINE_FALLBACK:
            connectorStatus.localAuthorizeIdTag = idTag
            connectorStatus.idTagLocalAuthorized = true
            break
          case AuthenticationMethod.CERTIFICATE_BASED:
          case AuthenticationMethod.NONE:
          case AuthenticationMethod.REMOTE_AUTHORIZATION:
            break
        }
      }
      return true
    }

    return false
  } catch (error) {
    logger.error(`${chargingStation.logPrefix()} Authorization failed`, error)
    return false
  }
}
