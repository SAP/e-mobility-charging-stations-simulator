/** Discriminant codes for {@link SandcastleError}. */
export type SandcastleErrorCode =
  | 'aborted'
  | 'invariant_violation'
  | 'path_traversal'
  | 'planner_exhausted'
  | 'source_fetch_failed'
  | 'source_no_strategies'
  | 'source_parse_failed'
  | 'strategy_invalid'
  | 'unknown_strategy'

/**
 * Sandcastle orchestrator error. Adds a {@link code} discriminant and a
 * `date` timestamp to {@link Error} so catch-site handlers can branch on
 * the failure category without parsing `message`. Self-contained:
 * `.sandcastle/` does not import from `src/`.
 */
export class SandcastleError extends Error {
  readonly code: SandcastleErrorCode
  readonly date: Date

  constructor (code: SandcastleErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = new.target.name
    this.date = new Date()
    Object.setPrototypeOf(this, new.target.prototype)
    this.code = code
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}
