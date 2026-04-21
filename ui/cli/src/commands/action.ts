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

const NO_STATIONS_ERROR = 'No stations available. Start stations before running this command.'

const MIXED_OCPP_VERSION_ERROR =
  'Cannot determine a common OCPP version for the targeted stations. ' +
  'Target homogeneous stations (same OCPP version) or use -p to pass the payload directly.'

const UNKNOWN_OCPP_VERSION_ERROR =
  'The targeted station(s) have not reported their OCPP version yet. ' +
  'Ensure stations are connected and registered, or use -p to pass the payload directly.'

export const UNSUPPORTED_OCPP_VERSION_ERROR =
  'Unsupported OCPP version for this command. Use -p to pass the payload directly.'

export const parseInteger = (value: string, nameOrPrevious?: number | string): number => {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) {
    const label = typeof nameOrPrevious === 'string' ? nameOrPrevious : undefined
    throw new Error(
      label != null
        ? `${label}: expected integer, got '${value}'`
        : `Expected integer, got '${value}'`
    )
  }
  return n
}

// SHA-384 hex hashes are 96 chars; >= half-length is treated as a full or near-full hash.
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
 * @throws {Error} if any prefix matches zero stations or more than one station
 */
const resolveShortHashIdsFromList = (hashIds: string[], allHashIds: string[]): string[] =>
  hashIds.map(input => {
    if (input.length >= MIN_FULL_HASH_LENGTH) {
      if (allHashIds.includes(input)) return input
      throw new Error(`No station found matching hash ID '${input}'`)
    }

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
 * Unlike resolveShortHashIdsFromList, this function never throws.
 * @param hashIds - station hash IDs or unique hash-ID prefixes to target;
 *   each entry is matched via startsWith against station hashIds.
 *   Non-matching prefixes are silently excluded from targeting (no throw).
 *   Pass an empty array to target all stations.
 * @param chargingStations - station list to filter and inspect
 * @returns the common OCPPVersion, or undefined if the targeted set is empty
 *   or the targeted stations run heterogeneous versions
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
 * @returns the common OCPPVersion, the fully-resolved hash IDs,
 *   and the loaded UI server config
 * @throws {Error} if no stations are available, hash IDs don't match, or the
 *   targeted stations do not share a single known OCPP version
 */
export const resolveOcppVersionFromProgram = async (
  program: Command,
  hashIds: string[]
): Promise<{
  config: UIServerConfigurationSection
  ocppVersion: OCPPVersion
  resolvedHashIds: string[]
}> => {
  const rootOpts = program.opts<GlobalOptions>()
  const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl })
  const listResponse = await fetchStationList(config)

  if (listResponse.chargingStations.length === 0) {
    throw new Error(NO_STATIONS_ERROR)
  }

  const allHashIds = listResponse.chargingStations.map(cs => cs.stationInfo.hashId)
  const resolvedHashIds =
    hashIds.length === 0 ? hashIds : resolveShortHashIdsFromList(hashIds, allHashIds)
  const ocppVersion = resolveOcppVersionFromList(resolvedHashIds, listResponse.chargingStations)
  if (ocppVersion == null) {
    const targeted =
      resolvedHashIds.length === 0
        ? listResponse.chargingStations
        : listResponse.chargingStations.filter(cs =>
          resolvedHashIds.some(id => cs.stationInfo.hashId.startsWith(id))
        )
    const hasUnknown = targeted.some(cs => cs.stationInfo.ocppVersion == null)
    throw new Error(hasUnknown ? UNKNOWN_OCPP_VERSION_ERROR : MIXED_OCPP_VERSION_ERROR)
  }
  return { config, ocppVersion, resolvedHashIds }
}

const formatError = (program: Command, error: unknown): void => {
  const rootOpts = program.opts<GlobalOptions>()
  const formatter = createFormatter(rootOpts.json)
  if (error instanceof ServerFailureError) {
    formatter.output(error.payload)
  } else {
    formatter.error(error)
  }
  process.exitCode = 1
}

export const handleActionErrors = async (
  program: Command,
  fn: () => Promise<void>
): Promise<void> => {
  try {
    await fn()
  } catch (error: unknown) {
    formatError(program, error)
  }
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
    formatError(program, error)
  }
}
