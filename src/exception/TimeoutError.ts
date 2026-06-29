// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { BaseError } from './BaseError.js'

/** Sentinel error used by `promiseWithTimeout` call sites to discriminate timeout from upstream errors via `instanceof`. */
export class TimeoutError extends BaseError {}
