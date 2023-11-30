import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';

import { Constants } from './Constants';
import { isNotEmptyString, logPrefix as utilsLogPrefix } from './Utils';
import { type ElementsPerWorkerType, FileType, StorageType } from '../types';
import { WorkerProcessType } from '../worker';

export const logPrefix = (): string => {
  return utilsLogPrefix(' Simulator configuration |');
};

export const buildPerformanceUriFilePath = (file: string) => {
  return `file://${join(resolve(dirname(fileURLToPath(import.meta.url)), '../'), file)}`;
};

export const getDefaultPerformanceStorageUri = (storageType: StorageType) => {
  switch (storageType) {
    case StorageType.JSON_FILE:
      return buildPerformanceUriFilePath(
        `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_FILENAME}`,
      );
    case StorageType.SQLITE:
      return buildPerformanceUriFilePath(
        `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`,
      );
    default:
      throw new Error(`Unsupported storage type '${storageType}'`);
  }
};

export const handleFileException = (
  file: string,
  fileType: FileType,
  error: NodeJS.ErrnoException,
  logPfx: string,
): void => {
  const prefix = isNotEmptyString(logPfx) ? `${logPfx} ` : '';
  let logMsg: string;
  switch (error.code) {
    case 'ENOENT':
      logMsg = `${fileType} file ${file} not found: `;
      break;
    case 'EEXIST':
      logMsg = `${fileType} file ${file} already exists: `;
      break;
    case 'EACCES':
      logMsg = `${fileType} file ${file} access denied: `;
      break;
    case 'EPERM':
      logMsg = `${fileType} file ${file} permission denied: `;
      break;
    default:
      logMsg = `${fileType} file ${file} error: `;
  }
  console.error(`${chalk.green(prefix)}${chalk.red(logMsg)}`, error);
  throw error;
};

export const checkWorkerProcessType = (workerProcessType: WorkerProcessType): void => {
  if (!Object.values(WorkerProcessType).includes(workerProcessType)) {
    throw new SyntaxError(
      `Invalid worker process type '${workerProcessType}' defined in configuration`,
    );
  }
};

export const checkWorkerElementsPerWorker = (
  elementsPerWorker: ElementsPerWorkerType | undefined,
): void => {
  if (
    elementsPerWorker !== undefined &&
    elementsPerWorker !== 'auto' &&
    elementsPerWorker !== 'all' &&
    !Number.isSafeInteger(elementsPerWorker)
  ) {
    throw new SyntaxError(
      `Invalid number of elements per worker '${elementsPerWorker}' defined in configuration`,
    );
  }
  if (Number.isSafeInteger(elementsPerWorker) && (elementsPerWorker as number) <= 0) {
    throw RangeError(
      `Invalid negative or zero number of elements per worker '${elementsPerWorker}' defined in configuration`,
    );
  }
};