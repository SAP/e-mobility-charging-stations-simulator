import { execFile } from 'node:child_process'
import util from 'node:util'

/** Async execFile — does not block the event loop. Same error shape as execFileSync. */
export const execFileAsync = util.promisify(execFile)

/**
 * Converts an unknown thrown value to a human-readable error message.
 * @param err - The caught value (may be an `Error` or any other type).
 * @returns The `message` property if `err` is an `Error`, otherwise `String(err)`.
 */
export function toErrorMessage (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
