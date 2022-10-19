import LRUCache from 'mnemonist/lru-map-with-delete';

import type { ChargingStationConfiguration } from '../types/ChargingStationConfiguration';
import type { ChargingStationTemplate } from '../types/ChargingStationTemplate';
import Utils from '../utils/Utils';

enum CacheType {
  CHARGING_STATION_TEMPLATE = 'chargingStationTemplate',
  CHARGING_STATION_CONFIGURATION = 'chargingStationConfiguration',
}

type CacheableType = ChargingStationTemplate | ChargingStationConfiguration;

export default class SharedLRUCache {
  private static instance: SharedLRUCache | null = null;
  private readonly lruCache: LRUCache<string, CacheableType>;

  private constructor() {
    this.lruCache = new LRUCache<string, CacheableType>(1000);
  }

  public static getInstance(): SharedLRUCache {
    if (SharedLRUCache.instance === null) {
      SharedLRUCache.instance = new SharedLRUCache();
    }
    return SharedLRUCache.instance;
  }

  public hasChargingStationConfiguration(chargingStationConfigurationHash: string): boolean {
    return this.has(this.getChargingStationConfigurationKey(chargingStationConfigurationHash));
  }

  public setChargingStationConfiguration(
    chargingStationConfiguration: ChargingStationConfiguration
  ): void {
    if (this.isChargingStationConfigurationCacheable(chargingStationConfiguration)) {
      this.set(
        this.getChargingStationConfigurationKey(chargingStationConfiguration.configurationHash),
        chargingStationConfiguration
      );
    }
  }

  public getChargingStationConfiguration(
    chargingStationConfigurationHash: string
  ): ChargingStationConfiguration {
    return this.get(
      this.getChargingStationConfigurationKey(chargingStationConfigurationHash)
    ) as ChargingStationConfiguration;
  }

  public deleteChargingStationConfiguration(chargingStationConfigurationHash: string): void {
    this.delete(this.getChargingStationConfigurationKey(chargingStationConfigurationHash));
  }

  public hasChargingStationTemplate(chargingStationTemplateHash: string): boolean {
    return this.has(this.getChargingStationTemplateKey(chargingStationTemplateHash));
  }

  public setChargingStationTemplate(chargingStationTemplate: ChargingStationTemplate): void {
    this.set(
      this.getChargingStationTemplateKey(chargingStationTemplate.templateHash),
      chargingStationTemplate
    );
  }

  public getChargingStationTemplate(chargingStationTemplateHash: string): ChargingStationTemplate {
    return this.get(
      this.getChargingStationTemplateKey(chargingStationTemplateHash)
    ) as ChargingStationTemplate;
  }

  public deleteChargingStationTemplate(chargingStationTemplateHash: string): void {
    this.delete(this.getChargingStationTemplateKey(chargingStationTemplateHash));
  }

  public clear(): void {
    this.lruCache.clear();
  }

  private getChargingStationConfigurationKey(hash: string): string {
    return CacheType.CHARGING_STATION_CONFIGURATION + hash;
  }

  private getChargingStationTemplateKey(hash: string): string {
    return CacheType.CHARGING_STATION_TEMPLATE + hash;
  }

  private has(key: string): boolean {
    return this.lruCache.has(key);
  }

  private get(key: string): CacheableType {
    return this.lruCache.get(key);
  }

  private set(key: string, value: CacheableType): void {
    this.lruCache.set(key, value);
  }

  private delete(key: string): void {
    this.lruCache.delete(key);
  }

  private isChargingStationConfigurationCacheable(
    chargingStationConfiguration: ChargingStationConfiguration
  ): boolean {
    return (
      Utils.isNullOrUndefined(chargingStationConfiguration?.configurationKey) === false &&
      Utils.isNullOrUndefined(chargingStationConfiguration?.stationInfo) === false &&
      Utils.isNullOrUndefined(chargingStationConfiguration?.configurationHash) === false &&
      Utils.isEmptyArray(chargingStationConfiguration?.configurationKey) === false &&
      Utils.isEmptyObject(chargingStationConfiguration?.stationInfo) === false &&
      Utils.isEmptyString(chargingStationConfiguration?.configurationHash) === false
    );
  }
}
