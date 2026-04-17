import type { Command } from 'commander'

import process from 'node:process'
import {
  ProcedureName,
  type RequestPayload,
  ResponseStatus,
  ServerFailureError,
  type UIServerConfigurationSection,
} from 'ui-common'

import type { StationListPayload } from '../output/renderers.js'
import type { GlobalOptions } from '../types.js'

import { executeCommand } from '../client/lifecycle.js'
import { loadConfig } from '../config/loader.js'
import { createFormatter } from '../output/formatter.js'
export const parseInteger = (value: string): number => {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) {
    throw new Error(`Expected integer, got '${value}'`)
  }
  return n
}

// SHA-384 hex hashes are 96 chars. Treat anything >= half-length as a full hash (skip resolution).
const MIN_FULL_HASH_LENGTH = 48

const resolveShortHashIds = async (
  hashIds: string[],
  config: UIServerConfigurationSection
): Promise<string[]> => {
  if (hashIds.length === 0) return []

  const allFull = hashIds.every(id => id.length >= MIN_FULL_HASH_LENGTH)
  if (allFull) return hashIds

  const response = await executeCommand({
    config,
    payload: {},
    procedureName: ProcedureName.LIST_CHARGING_STATIONS,
    silent: true,
  })

  if (response.status !== ResponseStatus.SUCCESS || !Array.isArray(response.chargingStations)) {
    throw new Error(
      `Failed to list charging stations for hash ID resolution (status: ${response.status})`
    )
  }

  const listResponse = response as StationListPayload
  const allHashIds = listResponse.chargingStations.map(cs => cs.stationInfo.hashId)

  return hashIds.map(input => {
    if (input.length >= MIN_FULL_HASH_LENGTH) return input

    const matches = allHashIds.filter(full => full.startsWith(input))
    if (matches.length === 1) return matches[0]
    if (matches.length === 0) {
      throw new Error(`No station found matching hash prefix '${input}'`)
    }
    throw new Error(
      `Ambiguous hash prefix '${input}' matches ${matches.length.toString()} stations`
    )
  })
}

export const runAction = async (
  program: Command,
  procedureName: ProcedureName,
  payload: RequestPayload
): Promise<void> => {
  const rootOpts = program.opts<GlobalOptions>()
  const formatter = createFormatter(rootOpts.json)
  try {
    const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl })

    let resolvedPayload = payload
    if (Array.isArray(payload.hashIds) && payload.hashIds.length > 0) {
      resolvedPayload = {
        ...payload,
        hashIds: await resolveShortHashIds(payload.hashIds, config),
      }
    }

    await executeCommand({ config, formatter, payload: resolvedPayload, procedureName })
    process.exitCode = 0
  } catch (error: unknown) {
    if (error instanceof ServerFailureError) {
      formatter.output(error.payload)
    } else {
      formatter.error(error)
    }
    process.exitCode = 1
  }
}
