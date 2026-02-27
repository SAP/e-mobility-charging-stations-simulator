/**
 * Mock cache implementations for testing
 *
 * Provides in-memory caching without requiring Bootstrap initialization.
 */

import type {
  ChargingStationConfiguration,
  ChargingStationTemplate,
} from '../../../src/types/index.js'

/**
 * Mock IdTagsCache for testing
 *
 * Provides mock RFID tag management without file system access.
 */
export class MockIdTagsCache {
  private static instance: MockIdTagsCache | null = null
  private readonly idTagsMap = new Map<string, string[]>()

  public static getInstance (): MockIdTagsCache {
    MockIdTagsCache.instance ??= new MockIdTagsCache()
    return MockIdTagsCache.instance
  }

  public static resetInstance (): void {
    MockIdTagsCache.instance = null
  }

  public clear (): void {
    this.idTagsMap.clear()
  }

  public deleteIdTags (file: string): boolean {
    return this.idTagsMap.delete(file)
  }

  public getIdTag (): string {
    return 'TEST-TAG-001'
  }

  public getIdTags (file: string): string[] | undefined {
    return this.idTagsMap.get(file)
  }

  public setIdTags (file: string, idTags: string[]): void {
    this.idTagsMap.set(file, idTags)
  }
}

/**
 * Mock SharedLRUCache for testing
 *
 * Provides in-memory caching without requiring Bootstrap initialization.
 */
export class MockSharedLRUCache {
  private static instance: MockSharedLRUCache | null = null
  private readonly configurations = new Map<string, ChargingStationConfiguration>()
  private readonly templates = new Map<string, ChargingStationTemplate>()

  public static getInstance (): MockSharedLRUCache {
    MockSharedLRUCache.instance ??= new MockSharedLRUCache()
    return MockSharedLRUCache.instance
  }

  public static resetInstance (): void {
    MockSharedLRUCache.instance = null
  }

  public clear (): void {
    this.templates.clear()
    this.configurations.clear()
  }

  public deleteChargingStationConfiguration (hash: string): void {
    this.configurations.delete(hash)
  }

  public deleteChargingStationTemplate (hash: string): void {
    this.templates.delete(hash)
  }

  public getChargingStationConfiguration (hash: string): ChargingStationConfiguration | undefined {
    return this.configurations.get(hash)
  }

  public getChargingStationTemplate (hash: string): ChargingStationTemplate | undefined {
    return this.templates.get(hash)
  }

  public hasChargingStationConfiguration (hash: string): boolean {
    return this.configurations.has(hash)
  }

  public hasChargingStationTemplate (hash: string): boolean {
    return this.templates.has(hash)
  }

  public setChargingStationConfiguration (config: ChargingStationConfiguration): void {
    if (config.configurationHash != null) {
      this.configurations.set(config.configurationHash, config)
    }
  }

  public setChargingStationTemplate (template: ChargingStationTemplate): void {
    if (template.templateHash != null) {
      this.templates.set(template.templateHash, template)
    }
  }
}
