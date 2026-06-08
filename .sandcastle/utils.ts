import type { AgentProvider, PiOptions } from '@ai-hero/sandcastle'

import * as sandcastle from '@ai-hero/sandcastle'
import { execFile } from 'node:child_process'
import util from 'node:util'

import { AGENT_PROVIDER } from './constants.js'

/**
 * Promisified `node:child_process.execFile`.
 * Rejects with the underlying ExecException and preserves `stdout` / `stderr`
 * on the thrown object when node provides them.
 */
export const execFileAsync = util.promisify(execFile)

/**
 * Builds the sandcastle agent provider selected by `AGENT_PROVIDER`.
 * @param model - Provider-specific model identifier.
 * @param effort - Reasoning effort mapped to `variant` (opencode) or `thinking` (pi).
 * @returns Configured sandcastle agent provider.
 */
export function agentProvider (model: string, effort?: PiOptions['thinking']): AgentProvider {
  switch (AGENT_PROVIDER) {
    case 'opencode':
      return sandcastle.opencode(model, effort ? { variant: effort } : undefined)
    case 'pi':
      return sandcastle.pi(model, effort ? { thinking: effort } : undefined)
  }
}

/**
 * Validates a 40-char lowercase-hex git SHA-1.
 * @param s - Candidate SHA string.
 * @returns `true` iff `s` matches `/^[0-9a-f]{40}$/`.
 */
export function isValidSha (s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s)
}

/**
 * Converts an unknown thrown value to a human-readable error message.
 * @param err - The caught value (may be an `Error` or any other type).
 * @returns The `message` property if `err` is an `Error`, otherwise `String(err)`.
 */
export function toErrorMessage (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
