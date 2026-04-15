import { randomUUID as cryptoRandomUUID } from 'node:crypto'

import type { UUIDv4 } from '../types/UUID.js'

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const randomUUID = (): UUIDv4 => {
  return cryptoRandomUUID() as UUIDv4
}

export const validateUUID = (uuid: unknown): uuid is UUIDv4 => {
  return typeof uuid === 'string' && UUID_V4_REGEX.test(uuid)
}
