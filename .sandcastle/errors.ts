import { BaseError } from '../src/exception/index.js'

/** Discriminant codes for {@link SandcastleError}. */
export type SandcastleErrorCode =
  | 'planner_exhausted'
  | 'source_fetch_failed'
  | 'source_no_strategies'
  | 'source_parse_failed'
  | 'strategy_invalid'
  | 'unknown_strategy'

/**
 * Sandcastle orchestrator error. Adds a {@link code} discriminant to
 * {@link BaseError} so catch-site handlers can branch on the failure
 * category without parsing `message`.
 */
export class SandcastleError extends BaseError {
  readonly code: SandcastleErrorCode

  constructor (code: SandcastleErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.code = code
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}
