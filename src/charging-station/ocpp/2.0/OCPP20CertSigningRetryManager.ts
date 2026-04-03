import { millisecondsToSeconds, secondsToMilliseconds } from 'date-fns'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { JsonType, OCPP20SignCertificateResponse } from '../../../types/index.js'

import {
  GenericStatus,
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
} from '../../../types/index.js'
import { computeExponentialBackOffDelay, logger } from '../../../utils/index.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

const moduleName = 'OCPP20CertSigningRetryManager'

/**
 * Manages certificate signing retry with exponential back-off per OCPP 2.0.1 A02.FR.17-19.
 *
 * After a SignCertificateResponse(Accepted), starts a timer. If no CertificateSignedRequest
 * is received before CertSigningWaitMinimum expires, sends a new SignCertificateRequest with
 * doubled back-off, up to CertSigningRepeatTimes attempts.
 */
export class OCPP20CertSigningRetryManager {
  private retryAborted = false
  private retryCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  constructor (private readonly chargingStation: ChargingStation) {}

  /**
   * Cancel any pending retry timer.
   * Called when CertificateSignedRequest is received (A02.FR.20) or station stops.
   */
  public cancelRetryTimer (): void {
    this.retryAborted = true
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    this.retryCount = 0
    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.cancelRetryTimer: Retry timer cancelled`
    )
  }

  /**
   * Start the retry back-off timer after SignCertificateResponse(Accepted).
   * @param certificateType - Optional certificate type for re-signing
   */
  public startRetryTimer (certificateType?: string): void {
    this.cancelRetryTimer()
    this.retryAborted = false
    const waitMinimum = OCPP20ServiceUtils.readVariableAsInteger(
      this.chargingStation,
      OCPP20ComponentName.SecurityCtrlr,
      OCPP20OptionalVariableName.CertSigningWaitMinimum,
      0
    )
    if (waitMinimum <= 0) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.startRetryTimer: ${OCPP20OptionalVariableName.CertSigningWaitMinimum} not configured or invalid, retry disabled`
      )
      return
    }
    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.startRetryTimer: Starting cert signing retry timer with initial backoff ${waitMinimum.toString()}s`
    )
    this.scheduleNextRetry(certificateType, waitMinimum)
  }

  private scheduleNextRetry (certificateType?: string, waitMinimumSeconds?: number): void {
    const maxRetries = OCPP20ServiceUtils.readVariableAsInteger(
      this.chargingStation,
      OCPP20ComponentName.SecurityCtrlr,
      OCPP20OptionalVariableName.CertSigningRepeatTimes,
      0
    )
    if (this.retryCount >= maxRetries) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.scheduleNextRetry: Max retry count ${maxRetries.toString()} reached, giving up`
      )
      this.retryCount = 0
      return
    }

    const baseDelayMs = secondsToMilliseconds(
      waitMinimumSeconds ??
        OCPP20ServiceUtils.readVariableAsInteger(
          this.chargingStation,
          OCPP20ComponentName.SecurityCtrlr,
          OCPP20OptionalVariableName.CertSigningWaitMinimum,
          60
        )
    )
    const delayMs = computeExponentialBackOffDelay({
      baseDelayMs,
      maxRetries,
      retryNumber: this.retryCount,
    })

    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.scheduleNextRetry: Scheduling retry ${(this.retryCount + 1).toString()}/${maxRetries.toString()} in ${millisecondsToSeconds(delayMs).toString()}s`
    )

    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.retryCount++
      logger.info(
        `${this.chargingStation.logPrefix()} ${moduleName}.scheduleNextRetry: Sending SignCertificateRequest retry ${this.retryCount.toString()}/${maxRetries.toString()}`
      )

      this.chargingStation.ocppRequestService
        .requestHandler<JsonType, OCPP20SignCertificateResponse>(
          this.chargingStation,
          OCPP20RequestCommand.SIGN_CERTIFICATE,
          certificateType != null ? { certificateType } : {},
          { skipBufferingOnError: true }
        )
        .then(response => {
          if (this.retryAborted) {
            return undefined
          }
          if (response.status === GenericStatus.Accepted) {
            this.scheduleNextRetry(certificateType)
          } else {
            logger.warn(
              `${this.chargingStation.logPrefix()} ${moduleName}.scheduleNextRetry: SignCertificate retry rejected by CSMS, stopping retries`
            )
            this.retryCount = 0
          }
          return undefined
        })
        .catch((error: unknown) => {
          if (this.retryAborted) {
            return
          }
          logger.error(
            `${this.chargingStation.logPrefix()} ${moduleName}.scheduleNextRetry: SignCertificate retry failed`,
            error
          )
          this.scheduleNextRetry(certificateType)
        })
    }, delayMs)
  }
}
