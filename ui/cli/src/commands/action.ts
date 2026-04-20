import type { Command } from 'commander'

import process from 'node:process'
import {
  type OCPPVersion,
  ProcedureName,
  type RequestPayload,
  ResponseStatus,
  ServerFailureError,
  type UIServerConfigurationSection,
} from 'ui-common'

import type { GlobalOptions, StationListPayload } from '../types.js'

import { executeCommand } from '../client/lifecycle.js'
import { loadConfig } from '../config/loader.js'
import { createFormatter } from '../output/formatter.js'
import { resolvePayload } from './resolve-payload.js'

export const parseInteger = (value: string): number => {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) {
    throw new Error(`Expected integer, got '${value}'`)
  }
  return n
}

// SHA-384 hex hashes are 96 chars. Treat anything >= half-length as a full hash (skip resolution).
const MIN_FULL_HASH_LENGTH = 48

const fetchStationList = async (
  config: UIServerConfigurationSection
): Promise<StationListPayload> => {
  let response
  try {
    response = await executeCommand({
      config,
      payload: {},
      procedureName: ProcedureName.LIST_CHARGING_STATIONS,
      silent: true,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch charging station list: ${msg}`)
  }

  if (response.status !== ResponseStatus.SUCCESS || !Array.isArray(response.chargingStations)) {
    throw new Error(`Failed to list charging stations (status: ${response.status})`)
  }

  return response as StationListPayload
}

const resolveShortHashIds = async (
  hashIds: string[],
  config: UIServerConfigurationSection
): Promise<string[]> => {
  if (hashIds.length === 0) return []

  const allFull = hashIds.every(id => id.length >= MIN_FULL_HASH_LENGTH)
  if (allFull) return hashIds

  const listResponse = await fetchStationList(config)
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

/**
 * Pure helper: resolves the common OCPP version from a pre-fetched station list.
 * Exported for unit testing; callers should use resolveOcppVersion instead.
 * @param hashIds - station hash IDs (full or prefix) to target; empty means all stations
 * @param chargingStations - station list to filter and inspect
 * @returns the common OCPPVersion, or undefined if no match or heterogeneous versions
 */
export const resolveOcppVersionFromList = (
  hashIds: string[],
  chargingStations: { stationInfo: { hashId: string; ocppVersion?: OCPPVersion } }[]
): OCPPVersion | undefined => {
  const targeted =
    hashIds.length === 0
      ? chargingStations
      : chargingStations.filter(cs =>
        hashIds.some(id => cs.stationInfo.hashId === id || cs.stationInfo.hashId.startsWith(id))
      )

  if (targeted.length === 0) return undefined

  const versions = new Set(targeted.map(cs => cs.stationInfo.ocppVersion))
  if (versions.size !== 1) return undefined

  return [...versions][0]
}

/**
 * Returns the OCPP version shared by all targeted stations, or undefined when
 * no stations match or the targeted stations run different versions.
 * @param hashIds - station hash IDs (full or prefix) to target; empty means all stations
 * @param config - UI server configuration
 * @returns the common OCPPVersion, or undefined if unavailable / heterogeneous
 */
export const resolveOcppVersion = async (
  hashIds: string[],
  config: UIServerConfigurationSection
): Promise<OCPPVersion | undefined> => {
  const listResponse = await fetchStationList(config)
  return resolveOcppVersionFromList(hashIds, listResponse.chargingStations)
}

export const runAction = async (
  program: Command,
  procedureName: ProcedureName,
  payload: RequestPayload,
  rawPayload?: string
): Promise<void> => {
  const rootOpts = program.opts<GlobalOptions>()
  const formatter = createFormatter(rootOpts.json)
  try {
    let mergedPayload = payload
    if (rawPayload != null) {
      const extra = await resolvePayload(rawPayload)
      mergedPayload = { ...extra, ...payload }
    }

    const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl })

    let resolvedPayload = mergedPayload
    if (Array.isArray(mergedPayload.hashIds) && mergedPayload.hashIds.length > 0) {
      resolvedPayload = {
        ...mergedPayload,
        hashIds: await resolveShortHashIds(mergedPayload.hashIds, config),
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
