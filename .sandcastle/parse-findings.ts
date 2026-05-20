import type { Finding } from './types.js'

import { parseFindingsSafe } from './types.js'

/**
 * Parses findings from agent stdout using nonce-tagged delimiters.
 *
 * The agent prompt instructs the LLM to wrap its JSON findings array in
 * `<findings-{nonce}>...</findings-{nonce}>` markers; the nonce is generated
 * per critic invocation to make output streams unambiguous when N critics run
 * in parallel against the same task.
 *
 * Algorithm:
 *  1. Reject `nonce` that is not pure lowercase hex (defense against tag
 *     injection from agent stdout — a malicious or malformed nonce could
 *     otherwise be used to construct an arbitrary regex).
 *  2. Find ALL `<findings-{nonce}>...</findings-{nonce}>` blocks.
 *  3. Iterate from the LAST match backwards: take the first non-trivial
 *     (length ≥ 2) block whose contents parse as JSON. This handles the
 *     common case where the agent emits an empty placeholder before the
 *     real payload, or wraps the payload in `\`\`\`json` code fences.
 *  4. Strip leading/trailing `\`\`\`json` ... `\`\`\`` fences before JSON.parse.
 *  5. Return `parseFindingsSafe(JSON.parse(cleaned))` on success; `null` if
 *     no block parses successfully.
 * @param stdout - Agent stdout to parse findings from.
 * @param nonce - Unique tag identifier for this run; must match `/^[0-9a-f]+$/`.
 * @returns Parsed findings array or null on parse failure / nonce mismatch.
 */
export function parseFindings (stdout: string, nonce: string): Finding[] | null {
  if (!/^[0-9a-f]+$/.test(nonce)) return null
  const tagPattern = new RegExp(`<findings-${nonce}>([\\s\\S]*?)<\\/findings-${nonce}>`, 'g')
  const matches = [...stdout.matchAll(tagPattern)]
  if (matches.length === 0) return null
  for (let i = matches.length - 1; i >= 0; i--) {
    const raw = matches[i]?.[1]?.trim() ?? ''
    if (raw.length < 2) continue
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/g, '').replace(/\n?```\s*$/g, '')
    try {
      return parseFindingsSafe(JSON.parse(cleaned))
    } catch {
      continue
    }
  }
  return null
}
