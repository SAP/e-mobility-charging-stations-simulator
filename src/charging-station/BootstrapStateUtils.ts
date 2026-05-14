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
import { AsyncLock, AsyncLockType, handleFileException, logger } from '../utils/index.js'

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
    if (logPrefixFn != null) {
      handleFileException(
        stateFilePath,
        FileType.SimulatorState,
        error as NodeJS.ErrnoException,
        logPrefixFn()
      )
    }
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
    const content = JSON.parse(readFileSync(stateFilePath, 'utf8')) as Partial<SimulatorStateFile>
    if (typeof content.version !== 'number' || typeof content.started !== 'boolean') {
      logger.warn(
        `${logPrefixFn?.() ?? ''} ${moduleName}.readStateFile: Invalid state file content, deleting`
      )
      deleteStateFile(stateFilePath, logPrefixFn)
      return undefined
    }
    if (content.version !== STATE_FILE_VERSION) {
      logger.warn(
        `${logPrefixFn?.() ?? ''} ${moduleName}.readStateFile: Incompatible state file schema version ${content.version.toString()}, expected ${STATE_FILE_VERSION.toString()}, deleting`
      )
      deleteStateFile(stateFilePath, logPrefixFn)
      return undefined
    }
    return content as SimulatorStateFile
  } catch (error) {
    logger.warn(
      `${logPrefixFn?.() ?? ''} ${moduleName}.readStateFile: Failed to read state file, deleting:`,
      error
    )
    deleteStateFile(stateFilePath, logPrefixFn)
    return undefined
  }
}

export const reconstructTemplateIndexes = (
  configurationsDir: string,
  stateFilePath: string,
  templateStatistics: Map<string, TemplateStatistics>,
  logPrefixFn?: () => string
): void => {
  if (!existsSync(configurationsDir)) {
    return
  }
  const stateFileName = basename(stateFilePath)
  let files: string[]
  try {
    files = readdirSync(configurationsDir).filter(
      file => file.endsWith('.json') && file !== stateFileName
    )
  } catch (error) {
    logger.warn(
      `${logPrefixFn?.() ?? ''} ${moduleName}.reconstructTemplateIndexes: Failed to read configurations directory:`,
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
          `${logPrefixFn?.() ?? ''} ${moduleName}.reconstructTemplateIndexes: Skipping ${file} — missing templateName or templateIndex`
        )
        continue
      }
      const templateStats = templateStatistics.get(stationInfo.templateName)
      if (templateStats != null) {
        templateStats.indexes.add(stationInfo.templateIndex)
      }
    } catch (error) {
      logger.warn(
        `${logPrefixFn?.() ?? ''} ${moduleName}.reconstructTemplateIndexes: Skipping corrupt file ${file}:`,
        error
      )
    }
  }
}

export const writeStateFile = async (stateFilePath: string, started: boolean): Promise<void> => {
  await AsyncLock.runExclusive(AsyncLockType.simulatorState, () => {
    const stateFileDir = dirname(stateFilePath)
    mkdirSync(stateFileDir, { recursive: true })
    const tmpFile = `${stateFilePath}.tmp`
    const stateData: SimulatorStateFile = {
      started,
      version: STATE_FILE_VERSION,
    }
    writeFileSync(tmpFile, JSON.stringify(stateData, undefined, 2), 'utf8')
    renameSync(tmpFile, stateFilePath)
  })
}
