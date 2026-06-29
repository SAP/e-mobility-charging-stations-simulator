import { BaseError } from './BaseError.js'

/**
 * Sentinel error used by `Bootstrap.waitChargingStationsStopped` to
 * discriminate timeouts from upstream errors via `instanceof TimeoutError`.
 * The subclass discriminator survives any future wrapping in
 * `Utils.promiseWithTimeout`, where the original identity check
 * (`error === timeoutError`) would silently break.
 */
export class TimeoutError extends BaseError {}
