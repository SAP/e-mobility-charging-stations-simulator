import { BaseError } from '../src/exception/index.js'

/**
 * Discriminant codes for {@link SandcastleError}. Each member identifies a
 * distinct failure mode in the orchestrator (task discovery, planning,
 * registry lookup, strategy invariants).
 */
export type SandcastleErrorCode =
  | 'planner_exhausted'
  | 'source_fetch_failed'
  | 'source_no_strategies'
  | 'source_parse_failed'
  | 'strategy_invalid'
  | 'unknown_strategy'

/**
 * Typed error thrown by the sandcastle orchestrator. Extends {@link BaseError}
 * to inherit the repo-wide error shape: `name = new.target.name` (subclass-
 * aware), `date = new Date()` (timestamp), and prototype-chain restoration via
 * `Object.setPrototypeOf` so `instanceof` survives transpilation/realms.
 *
 * The `code` discriminant lets kernel-boundary catch handlers branch on the
 * failure category without parsing `message`. `cause` is forwarded explicitly
 * because `BaseError`'s constructor signature is `(message?: string)` and
 * does not accept the `ErrorOptions` bag.
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
