import { LRUMapWithDelete as LRUCache } from 'mnemonist'

import type { ChargingStationConfiguration, ChargingStationTemplate } from '../types/index.js'

import { isEmpty, isNotEmptyArray, isNotEmptyString } from '../utils/index.js'
import { Bootstrap } from './Bootstrap.js'

enum CacheType {
  chargingStationConfiguration = 'chargingStationConfiguration',
  chargingStationTemplate = 'chargingStationTemplate',
}

type CacheValueType = ChargingStationConfiguration | ChargingStationTemplate

export class SharedLRUCache {
  private static instance: null | SharedLRUCache = null
  private readonly lruCache: LRUCache<string, CacheValueType>

  private constructor () {
    this.lruCache = new LRUCache<string, CacheValueType>(
      Bootstrap.getInstance().numberOfChargingStationTemplates +
        Bootstrap.getInstance().numberOfConfiguredChargingStations +
        Bootstrap.getInstance().numberOfProvisionedChargingStations
    )
  }

  public static getInstance (): SharedLRUCache {
    SharedLRUCache.instance ??= new SharedLRUCache()
    return SharedLRUCache.instance
  }

  public clear (): void {
    this.lruCache.clear()
  }

  public deleteChargingStationConfiguration (chargingStationConfigurationHash: string): void {
    this.delete(this.getChargingStationConfigurationKey(chargingStationConfigurationHash))
  }

  public deleteChargingStationTemplate (chargingStationTemplateHash: string): void {
    this.delete(this.getChargingStationTemplateKey(chargingStationTemplateHash))
  }

  public getChargingStationConfiguration (
    chargingStationConfigurationHash: string
  ): ChargingStationConfiguration {
    return this.get(
      this.getChargingStationConfigurationKey(chargingStationConfigurationHash)
    ) as ChargingStationConfiguration
  }

  public getChargingStationTemplate (chargingStationTemplateHash: string): ChargingStationTemplate {
    return this.get(
      this.getChargingStationTemplateKey(chargingStationTemplateHash)
    ) as ChargingStationTemplate
  }

  public hasChargingStationConfiguration (chargingStationConfigurationHash: string): boolean {
    return this.has(this.getChargingStationConfigurationKey(chargingStationConfigurationHash))
  }

  public hasChargingStationTemplate (chargingStationTemplateHash: string): boolean {
    return this.has(this.getChargingStationTemplateKey(chargingStationTemplateHash))
  }

  public setChargingStationConfiguration (
    chargingStationConfiguration: ChargingStationConfiguration
  ): void {
    if (this.isChargingStationConfigurationCacheable(chargingStationConfiguration)) {
      this.set(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.getChargingStationConfigurationKey(chargingStationConfiguration.configurationHash!),
        chargingStationConfiguration
      )
    }
  }

  public setChargingStationTemplate (chargingStationTemplate: ChargingStationTemplate): void {
    this.set(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.getChargingStationTemplateKey(chargingStationTemplate.templateHash!),
      chargingStationTemplate
    )
  }

  private delete (key: string): void {
    this.lruCache.delete(key)
  }

  private get (key: string): CacheValueType | undefined {
    return this.lruCache.get(key)
  }

  private getChargingStationConfigurationKey (hash: string): string {
    return `${CacheType.chargingStationConfiguration}${hash}`
  }

  private getChargingStationTemplateKey (hash: string): string {
    return `${CacheType.chargingStationTemplate}${hash}`
  }

  private has (key: string): boolean {
    return this.lruCache.has(key)
  }

  private isChargingStationConfigurationCacheable (
    chargingStationConfiguration: ChargingStationConfiguration
  ): boolean {
    return (
      chargingStationConfiguration.configurationKey != null &&
      chargingStationConfiguration.stationInfo != null &&
      chargingStationConfiguration.automaticTransactionGenerator != null &&
      chargingStationConfiguration.configurationHash != null &&
      isNotEmptyArray(chargingStationConfiguration.configurationKey) &&
      !isEmpty(chargingStationConfiguration.stationInfo) &&
      !isEmpty(chargingStationConfiguration.automaticTransactionGenerator) &&
      isNotEmptyString(chargingStationConfiguration.configurationHash)
    )
  }

  private set (key: string, value: CacheValueType): void {
    this.lruCache.set(key, value)
  }
}
