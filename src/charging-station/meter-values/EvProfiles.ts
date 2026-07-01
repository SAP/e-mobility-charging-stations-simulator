// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file EV profile file loader and selection helpers.
 * @description Loads and validates the on-disk `evProfilesFile` referenced
 *   by a station template. Loading is fail-soft: malformed or missing files
 *   return `undefined` so the caller disables coherent generation for that
 *   station rather than crashing station startup.
 */

import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import type { ChargingStationInfo } from '../../types/index.js'
import type { EvProfile, EvProfilesFile } from './types.js'

import { logger } from '../../utils/index.js'
import { EvProfilesFileSchema } from './types.js'

const moduleName = 'EvProfiles'

/**
 * Resolves the absolute path of `stationInfo.evProfilesFile` to the
 * `assets/` directory next to the built module (same convention as
 * `getIdTagsFile`).
 * @param stationInfo - Charging station info containing the `evProfilesFile` reference.
 * @returns Absolute path or `undefined` if not configured.
 */
export const getEvProfilesFile = (stationInfo: ChargingStationInfo): string | undefined => {
  return stationInfo.evProfilesFile != null
    ? join(dirname(fileURLToPath(import.meta.url)), 'assets', basename(stationInfo.evProfilesFile))
    : undefined
}

/**
 * Loads, parses, validates, and normalizes an EV profile file. Sorting the
 * charging curve by `socPercent` in-place makes downstream interpolation
 * assume a monotone x-axis without repeating the sort at every sample.
 *
 * Fail-soft: any error (missing file, invalid JSON, schema violation) is
 * logged and returns `undefined`.
 * @param filePath - Absolute path to the EV profile JSON file.
 * @param logPrefix - Log prefix for warnings; typically `chargingStation.logPrefix()`.
 * @returns Parsed {@link EvProfilesFile} or `undefined` on failure.
 */
export const loadEvProfilesFile = (
  filePath: string,
  logPrefix: string
): EvProfilesFile | undefined => {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const json = JSON.parse(raw) as unknown
    const parsed = EvProfilesFileSchema.parse(json)
    for (const profile of parsed.profiles) {
      profile.chargingCurve.sort((a, b) => a.socPercent - b.socPercent)
      if (profile.initialSocPercentMin > profile.initialSocPercentMax) {
        logger.warn(
          `${logPrefix} ${moduleName}.loadEvProfilesFile: profile '${profile.id}' has initialSocPercentMin > initialSocPercentMax, swapping bounds`
        )
        const tmp = profile.initialSocPercentMin
        profile.initialSocPercentMin = profile.initialSocPercentMax
        profile.initialSocPercentMax = tmp
      }
    }
    return parsed
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(
        `${logPrefix} ${moduleName}.loadEvProfilesFile: EV profile file '${filePath}' failed validation: ${error.message}`
      )
    } else {
      logger.warn(
        `${logPrefix} ${moduleName}.loadEvProfilesFile: EV profile file '${filePath}' could not be loaded: ${(error as Error).message}`
      )
    }
    return undefined
  }
}

/**
 * Weight-based profile selection. Chooses a profile from `profiles` using
 * the supplied random number in [0, 1). If total weight is zero, falls back
 * to the first profile.
 * @param profiles - Non-empty array of EV profiles.
 * @param random - Uniform float in [0, 1) (typically from a seeded stream).
 * @returns Selected profile.
 */
export const selectEvProfile = (profiles: EvProfile[], random: number): EvProfile => {
  const totalWeight = profiles.reduce((sum, profile) => sum + profile.weight, 0)
  if (totalWeight <= 0) {
    return profiles[0]
  }
  const target = random * totalWeight
  let cumulative = 0
  for (const profile of profiles) {
    cumulative += profile.weight
    if (target < cumulative) {
      return profile
    }
  }
  return profiles[profiles.length - 1]
}

/**
 * Piecewise-linear interpolation of `chargingCurve` at `socPercent`. The
 * curve must be sorted by `socPercent` (`loadEvProfilesFile` guarantees this).
 * @param curve - Sorted-by-`socPercent` curve.
 * @param socPercent - Query point in [0, 100].
 * @returns `powerFraction` in [0, 1] (clamped to the endpoints outside the
 *   curve range).
 */
export const interpolateChargingCurve = (
  curve: { powerFraction: number; socPercent: number }[],
  socPercent: number
): number => {
  if (curve.length === 0) {
    return 1
  }
  if (socPercent <= curve[0].socPercent) {
    return curve[0].powerFraction
  }
  if (socPercent >= curve[curve.length - 1].socPercent) {
    return curve[curve.length - 1].powerFraction
  }
  for (let index = 0; index < curve.length - 1; index++) {
    const a = curve[index]
    const b = curve[index + 1]
    if (socPercent >= a.socPercent && socPercent <= b.socPercent) {
      const span = b.socPercent - a.socPercent
      if (span === 0) {
        return a.powerFraction
      }
      const t = (socPercent - a.socPercent) / span
      return a.powerFraction + t * (b.powerFraction - a.powerFraction)
    }
  }
  return curve[curve.length - 1].powerFraction
}
