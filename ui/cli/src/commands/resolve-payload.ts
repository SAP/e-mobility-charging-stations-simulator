import type { RequestPayload } from 'ui-common'

import { readFile } from 'node:fs/promises'
import process from 'node:process'

export const resolvePayload = async (value: string): Promise<RequestPayload> => {
  let raw: string

  if (value === '-') {
    const { text } = await import('node:stream/consumers')
    raw = await text(process.stdin)
  } else if (value.startsWith('@')) {
    const path = value.slice(1)
    if (path.length === 0) {
      throw new Error('Missing file path after @')
    }
    raw = await readFile(path, 'utf8')
  } else {
    raw = value
  }

  raw = raw.trim()
  if (raw.length === 0) {
    throw new Error('Empty payload')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON payload: ${raw.slice(0, 120)}`)
  }

  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object')
  }

  return parsed as RequestPayload
}
