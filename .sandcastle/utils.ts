import type { AgentProvider, PiOptions } from '@ai-hero/sandcastle'

import * as sandcastle from '@ai-hero/sandcastle'
import { execFile } from 'node:child_process'
import util from 'node:util'

import { AGENT_PROVIDER } from './constants.js'

/** Async execFile — does not block the event loop. Same error shape as execFileSync. */
export const execFileAsync = util.promisify(execFile)

/**
 * Returns a sandcastle agent provider for the given model, selected by AGENT_PROVIDER constant.
 * @param model - The model identifier (e.g., 'github-copilot/claude-sonnet-4.6').
 * @param effort - Reasoning effort level passed as `variant` to opencode or `thinking` to pi.
 * @returns The configured agent provider.
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
 * Converts an unknown thrown value to a human-readable error message.
 * @param err - The caught value (may be an `Error` or any other type).
 * @returns The `message` property if `err` is an `Error`, otherwise `String(err)`.
 */
export function toErrorMessage (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
