/**
 * @file Temp-file helpers for tests that touch the real filesystem.
 * @description Centralizes the `mkdtemp` + write + cleanup boilerplate that file
 * I/O tests (id-tags cache, EV profiles, JSON storage, config hot-reload, file
 * utils, MCP logs) would otherwise each re-implement. Dirs created via
 * `createTempDir` are tracked and removed by `cleanupTempDirs` in `afterEach`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDirs: string[] = []

/**
 * Creates a fresh temp dir under the OS temp root and tracks it for cleanup.
 * @param prefix - Directory name prefix (kept per-suite for debuggability).
 * @returns Absolute path to the created dir.
 */
export const createTempDir = (prefix = 'omp-test-'): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

/**
 * Writes a file into an existing dir (typically from `createTempDir`).
 * @param dir - Target directory.
 * @param fileName - File name to write.
 * @param contents - File contents.
 * @returns Absolute path to the written file.
 */
export const writeTempFile = (dir: string, fileName: string, contents: string): string => {
  const file = join(dir, fileName)
  writeFileSync(file, contents, 'utf8')
  return file
}

/**
 * Removes every temp dir created by `createTempDir`. Call in `afterEach`.
 */
export const cleanupTempDirs = (): void => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
}
