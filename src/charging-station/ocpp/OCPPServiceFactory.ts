import type { OCPPIncomingRequestService } from './OCPPIncomingRequestService.js'
import type { OCPPRequestService } from './OCPPRequestService.js'

import { OCPPError } from '../../exception/index.js'
import { ErrorType, OCPPVersion } from '../../types/index.js'
import { OCPP16IncomingRequestService } from './1.6/OCPP16IncomingRequestService.js'
import { OCPP16RequestService } from './1.6/OCPP16RequestService.js'
import { OCPP16ResponseService } from './1.6/OCPP16ResponseService.js'
import { OCPP20IncomingRequestService } from './2.0/OCPP20IncomingRequestService.js'
import { OCPP20RequestService } from './2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from './2.0/OCPP20ResponseService.js'

/**
 * Creates OCPP request and incoming request service instances for the given OCPP version.
 * @param ocppVersion - OCPP protocol version to create services for.
 * @returns An object containing the incoming request service and request service instances.
 * @throws {OCPPError} If the OCPP version is not supported.
 */
export const createOCPPServices = (
  ocppVersion: OCPPVersion
): {
  incomingRequestService: OCPPIncomingRequestService
  requestService: OCPPRequestService
} => {
  switch (ocppVersion) {
    case OCPPVersion.VERSION_16:
      return {
        incomingRequestService:
          OCPP16IncomingRequestService.getInstance<OCPP16IncomingRequestService>(),
        requestService: OCPP16RequestService.getInstance<OCPP16RequestService>(
          OCPP16ResponseService.getInstance<OCPP16ResponseService>()
        ),
      }
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return {
        incomingRequestService:
          OCPP20IncomingRequestService.getInstance<OCPP20IncomingRequestService>(),
        requestService: OCPP20RequestService.getInstance<OCPP20RequestService>(
          OCPP20ResponseService.getInstance<OCPP20ResponseService>()
        ),
      }
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Unsupported OCPP version '${ocppVersion as string}'`
      )
  }
}
