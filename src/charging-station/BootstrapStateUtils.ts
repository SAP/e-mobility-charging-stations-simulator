// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

import type { TemplateStatistics } from '../types/index.js'

import { FileType } from '../types/index.js'
import {
  AsyncLock,
  AsyncLockType,
  ensureError,
  formatLogPrefix,
  handleFileException,
  logger,
} from '../utils/index.js'

const moduleName = 'BootstrapStateUtils'

export const STATE_FILE_VERSION = 1

export interface SimulatorStateFile {
  started: boolean
  version: number
}

export const deleteStateFile = (stateFilePath: string, logPrefixFn?: () => string): void => {
  try {
    rmSync(stateFilePath, { force: true })
  } catch (error) {
    handleFileException(
      stateFilePath,
      FileType.SimulatorState,
      ensureError(error),
      logPrefixFn?.() ?? '',
      { throwError: false }
    )
  }
}

export const readStateFile = (
  stateFilePath: string,
  logPrefixFn?: () => string
): SimulatorStateFile | undefined => {
  if (!existsSync(stateFilePath)) {
    return undefined
  }
  try {
    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8')) as unknown
    if (parsed == null || typeof parsed !== 'object') {
      logger.warn(
        `${formatLogPrefix(logPrefixFn)}${moduleName}.readStateFile: State file content is not a JSON object, deleting`
      )
      deleteStateFile(stateFilePath, logPrefixFn)
      return undefined
    }
    const content = parsed as Partial<SimulatorStateFile>
    if (typeof content.version !== 'number' || typeof content.started !== 'boolean') {
      logger.warn(
        `${formatLogPrefix(logPrefixFn)}${moduleName}.readStateFile: Invalid state file content, deleting`
      )
      deleteStateFile(stateFilePath, logPrefixFn)
      return undefined
    }
    if (content.version !== STATE_FILE_VERSION) {
      const backupPath = `${stateFilePath}.v${content.version.toString()}.bak`
      try {
        renameSync(stateFilePath, backupPath)
        logger.warn(
          `${formatLogPrefix(logPrefixFn)}${moduleName}.readStateFile: Incompatible state file schema version ${content.version.toString()} (expected ${STATE_FILE_VERSION.toString()}), quarantined to ${basename(backupPath)}`
        )
      } catch (renameError) {
        logger.warn(
          `${formatLogPrefix(logPrefixFn)}${moduleName}.readStateFile: Failed to quarantine incompatible state file, deleting:`,
          renameError
        )
        deleteStateFile(stateFilePath, logPrefixFn)
      }
      return undefined
    }
    return content as SimulatorStateFile
  } catch (error) {
    logger.warn(
      `${formatLogPrefix(logPrefixFn)}${moduleName}.readStateFile: Failed to read state file, deleting:`,
      error
    )
    deleteStateFile(stateFilePath, logPrefixFn)
    return undefined
  }
}

export const reconstructTemplateIndexes = (
  configurationsDir: string,
  templateStatistics: Map<string, TemplateStatistics>,
  logPrefixFn?: () => string
): void => {
  if (!existsSync(configurationsDir)) {
    return
  }
  let files: string[]
  try {
    files = readdirSync(configurationsDir).filter(
      file => file.endsWith('.json') && !file.startsWith('.')
    )
  } catch (error) {
    logger.warn(
      `${formatLogPrefix(logPrefixFn)}${moduleName}.reconstructTemplateIndexes: Failed to read configurations directory:`,
      error
    )
    return
  }
  for (const file of files) {
    const filePath = join(configurationsDir, file)
    try {
      const { stationInfo } = JSON.parse(readFileSync(filePath, 'utf8')) as {
        stationInfo?: { templateIndex?: number; templateName?: string }
      }
      if (stationInfo?.templateName == null || stationInfo.templateIndex == null) {
        logger.warn(
          `${formatLogPrefix(logPrefixFn)}${moduleName}.reconstructTemplateIndexes: Skipping ${file}: not a charging station configuration (missing stationInfo.templateName/templateIndex)`
        )
        continue
      }
      const templateStats = templateStatistics.get(stationInfo.templateName)
      if (templateStats != null) {
        templateStats.indexes.add(stationInfo.templateIndex)
      }
    } catch (error) {
      logger.warn(
        `${formatLogPrefix(logPrefixFn)}${moduleName}.reconstructTemplateIndexes: Skipping corrupt file ${file}:`,
        error
      )
    }
  }
}

export const writeStateFile = async (
  stateFilePath: string,
  started: boolean,
  logPrefixFn?: () => string
): Promise<void> => {
  await AsyncLock.runExclusive(AsyncLockType.simulatorState, () => {
    const tmpFile = `${stateFilePath}.tmp`
    try {
      mkdirSync(dirname(stateFilePath), { recursive: true })
      const stateData: SimulatorStateFile = {
        started,
        version: STATE_FILE_VERSION,
      }
      writeFileSync(tmpFile, JSON.stringify(stateData, undefined, 2), 'utf8')
      renameSync(tmpFile, stateFilePath)
    } catch (error) {
      // Best-effort tmp cleanup; ignore secondary failure to surface the original error.
      try {
        rmSync(tmpFile, { force: true })
      } catch {
        // Ignore
      }
      handleFileException(
        stateFilePath,
        FileType.SimulatorState,
        ensureError(error),
        logPrefixFn?.() ?? '',
        { throwError: false }
      )
    }
  })
}
