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

export const MIXED_OCPP_VERSION_ERROR =
  'Cannot determine a common OCPP version for the targeted stations. ' +
  'Target homogeneous stations (same OCPP version) or use -p to pass the payload directly.'

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

/**
 * Pure helper: resolves short hash-ID prefixes to full hashes against a
 * pre-fetched list of all station hash IDs.
 * @param hashIds - station hash IDs or unique hash-ID prefixes to resolve
 * @param allHashIds - full hash IDs of all known stations
 * @returns fully-resolved hash IDs in the same order as the input
 * @throws if any prefix matches zero stations or more than one station
 */
const resolveShortHashIdsFromList = (hashIds: string[], allHashIds: string[]): string[] =>
  hashIds.map(input => {
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

const resolveShortHashIds = async (
  hashIds: string[],
  config: UIServerConfigurationSection
): Promise<string[]> => {
  if (hashIds.length === 0) return []

  const allFull = hashIds.every(id => id.length >= MIN_FULL_HASH_LENGTH)
  if (allFull) return hashIds

  const listResponse = await fetchStationList(config)
  const allHashIds = listResponse.chargingStations.map(cs => cs.stationInfo.hashId)

  return resolveShortHashIdsFromList(hashIds, allHashIds)
}

/**
 * Pure helper: resolves the common OCPP version from a pre-fetched station list.
 * Exported for unit testing; callers should use resolveOcppVersionFromProgram.
 *
 * Unlike resolveShortHashIdsFromList, this function never throws on ambiguous or
 * non-matching prefixes — it returns undefined instead.
 * @param hashIds - station hash IDs or unique hash-ID prefixes to target;
 *   each entry is matched if the station's hashId equals it or starts with it.
 *   An ambiguous prefix (matching multiple stations) or a non-matching prefix
 *   does not throw — both cases cause undefined to be returned.
 *   Pass an empty array to target all stations.
 * @param chargingStations - station list to filter and inspect
 * @returns the common OCPPVersion, or undefined if no station matches, the
 *   prefix is ambiguous, or the targeted stations run heterogeneous versions
 */
export const resolveOcppVersionFromList = (
  hashIds: string[],
  chargingStations: { stationInfo: { hashId: string; ocppVersion?: OCPPVersion } }[]
): OCPPVersion | undefined => {
  const targeted =
    hashIds.length === 0
      ? chargingStations
      : chargingStations.filter(cs => hashIds.some(id => cs.stationInfo.hashId.startsWith(id)))

  if (targeted.length === 0) return undefined

  const versions = new Set(targeted.map(cs => cs.stationInfo.ocppVersion))
  if (versions.size !== 1) return undefined

  return [...versions][0]
}

/**
 * Loads config from program options, resolves short hash-ID prefixes to full
 * hashes in a single station-list fetch, and returns the common OCPP version
 * together with the resolved hash IDs and the loaded config. Pass the returned
 * resolvedHashIds into the payload and config into runAction to avoid a second
 * station-list fetch and config load.
 * @param program - Commander root program (provides config and server URL options)
 * @param hashIds - station hash IDs or unique hash-ID prefixes to target
 * @returns the common OCPPVersion (or undefined), the fully-resolved hash IDs,
 *   and the loaded UI server config
 */
export const resolveOcppVersionFromProgram = async (
  program: Command,
  hashIds: string[]
): Promise<{
  config: UIServerConfigurationSection
  ocppVersion: OCPPVersion | undefined
  resolvedHashIds: string[]
}> => {
  const rootOpts = program.opts<GlobalOptions>()
  const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl })
  const listResponse = await fetchStationList(config)
  const allHashIds = listResponse.chargingStations.map(cs => cs.stationInfo.hashId)
  const resolvedHashIds =
    hashIds.length === 0 ? hashIds : resolveShortHashIdsFromList(hashIds, allHashIds)
  const ocppVersion = resolveOcppVersionFromList(resolvedHashIds, listResponse.chargingStations)
  return { config, ocppVersion, resolvedHashIds }
}

export const runAction = async (
  program: Command,
  procedureName: ProcedureName,
  payload: RequestPayload,
  rawPayload?: string,
  preloadedConfig?: UIServerConfigurationSection
): Promise<void> => {
  const rootOpts = program.opts<GlobalOptions>()
  const formatter = createFormatter(rootOpts.json)
  try {
    let mergedPayload = payload
    if (rawPayload != null) {
      const extra = await resolvePayload(rawPayload)
      mergedPayload = { ...extra, ...payload }
    }

    const config =
      preloadedConfig ??
      (await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl }))

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
