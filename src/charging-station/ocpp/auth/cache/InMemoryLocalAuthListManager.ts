/**
 * @file InMemoryLocalAuthListManager
 * @description In-memory implementation of the LocalAuthListManager interface for managing
 * OCPP local authorization lists with O(1) lookups, optional capacity limits, and support
 * for full and differential update operations.
 */

import type { LocalAuthEntry, LocalAuthListManager } from '../interfaces/OCPPAuthService.js'

import { logger } from '../../../../utils/index.js'

const moduleName = 'InMemoryLocalAuthListManager'

/**
 * Entry used in differential update operations.
 *
 * When `status` is defined, the entry is added or updated in the list.
 * When `status` is `undefined`, the entry is removed from the list.
 * This models the OCPP behavior where absent idTagInfo (1.6) or
 * absent idTokenInfo (2.0) signals removal.
 */
export interface DifferentialAuthEntry {
  /** Optional expiry date */
  expiryDate?: Date
  /** Identifier value */
  identifier: string
  /** Entry metadata */
  metadata?: Record<string, unknown>
  /** Optional parent identifier */
  parentId?: string
  /** Authorization status — undefined signals removal */
  status?: string
}

/**
 * In-memory implementation of LocalAuthListManager.
 *
 * Uses a Map for O(1) identifier lookups. Supports an optional maximum
 * entry limit and tracks a list version number for synchronization
 * with the CSMS.
 */
export class InMemoryLocalAuthListManager implements LocalAuthListManager {
  private readonly entries = new Map<string, LocalAuthEntry>()

  private readonly maxEntries?: number

  private version = 0

  /**
   * @param maxEntries - Optional maximum number of entries allowed in the list
   */
  constructor (maxEntries?: number) {
    this.maxEntries = maxEntries

    logger.info(
      `${moduleName}: Initialized${maxEntries != null ? ` with maxEntries=${String(maxEntries)}` : ''}`
    )
  }

  /**
   * @param entry - Authorization list entry
   * @returns Promise that resolves when the entry is added
   * @throws {Error} if maxEntries is set and adding a new entry would exceed the limit
   */
  public addEntry (entry: LocalAuthEntry): Promise<void> {
    if (
      this.maxEntries != null &&
      !this.entries.has(entry.identifier) &&
      this.entries.size >= this.maxEntries
    ) {
      throw new Error(
        `${moduleName}: Cannot add entry '${entry.identifier}' — maximum capacity of ${String(this.maxEntries)} entries reached`
      )
    }

    this.entries.set(entry.identifier, entry)
    logger.debug(`${moduleName}: Added/updated entry for identifier: '${entry.identifier}'`)
    return Promise.resolve()
  }

  /**
   * @param entries - Differential entries to apply
   * @param version - New list version number
   * @returns Promise that resolves when the update is applied
   * @throws {Error} if maxEntries is set and adding new entries would exceed the limit
   */
  public applyDifferentialUpdate (entries: DifferentialAuthEntry[], version: number): Promise<void> {
    for (const entry of entries) {
      if (entry.status != null) {
        if (
          this.maxEntries != null &&
          !this.entries.has(entry.identifier) &&
          this.entries.size >= this.maxEntries
        ) {
          throw new Error(
            `${moduleName}: Cannot add entry '${entry.identifier}' — maximum capacity of ${String(this.maxEntries)} entries reached`
          )
        }
        this.entries.set(entry.identifier, entry as LocalAuthEntry)
      } else {
        this.entries.delete(entry.identifier)
        logger.debug(`${moduleName}: Differential removal of identifier: '${entry.identifier}'`)
      }
    }

    this.version = version
    logger.info(
      `${moduleName}: Applied differential update — ${String(entries.length)} entries processed, version=${String(version)}`
    )
    return Promise.resolve()
  }

  public clearAll (): Promise<void> {
    const count = this.entries.size
    this.entries.clear()

    logger.info(`${moduleName}: Cleared ${String(count)} entries`)
    return Promise.resolve()
  }

  public getAllEntries (): Promise<LocalAuthEntry[]> {
    return Promise.resolve([...this.entries.values()])
  }

  public getEntry (identifier: string): Promise<LocalAuthEntry | undefined> {
    return Promise.resolve(this.entries.get(identifier))
  }

  public getVersion (): Promise<number> {
    return Promise.resolve(this.version)
  }

  public removeEntry (identifier: string): Promise<void> {
    const deleted = this.entries.delete(identifier)

    if (deleted) {
      logger.debug(`${moduleName}: Removed entry for identifier: '${identifier}'`)
    }
    return Promise.resolve()
  }

  /**
   * @param entries - New entries for the list
   * @param version - New list version number
   * @returns Promise that resolves when the entries are set
   * @throws {Error} if maxEntries is set and the entries array exceeds the limit
   */
  public setEntries (entries: LocalAuthEntry[], version: number): Promise<void> {
    if (this.maxEntries != null && entries.length > this.maxEntries) {
      throw new Error(
        `${moduleName}: Cannot set ${String(entries.length)} entries — maximum capacity of ${String(this.maxEntries)} entries exceeded`
      )
    }

    this.entries.clear()

    for (const entry of entries) {
      this.entries.set(entry.identifier, entry)
    }

    this.version = version
    logger.info(
      `${moduleName}: Full update — ${String(entries.length)} entries set, version=${String(version)}`
    )
    return Promise.resolve()
  }

  public updateVersion (version: number): Promise<void> {
    this.version = version
    logger.debug(`${moduleName}: Version updated to ${String(version)}`)
    return Promise.resolve()
  }
}
