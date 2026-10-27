// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { BaseError } from './BaseError.js'

/**
 * Thrown when `EVSE_ASSETS_DIR` is set to a path that does not exist or is
 * not a directory.
 */
export class AssetsDirError extends BaseError {
  public override readonly name = 'AssetsDirError' as const
}
