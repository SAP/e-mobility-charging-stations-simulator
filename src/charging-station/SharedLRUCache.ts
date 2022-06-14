import ChargingStationConfiguration from '../types/ChargingStationConfiguration';
import ChargingStationTemplate from '../types/ChargingStationTemplate';
import LRUCache from 'mnemonist/lru-map-with-delete';
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
    if (!SharedLRUCache.instance) {
      SharedLRUCache.instance = new SharedLRUCache();
    }
    return SharedLRUCache.instance;
  }

  public hasChargingStationConfiguration(chargingStationConfigurationHash: string): boolean {
    return this.has(CacheType.CHARGING_STATION_CONFIGURATION + chargingStationConfigurationHash);
  }

  public setChargingStationConfiguration(
    chargingStationConfiguration: ChargingStationConfiguration
  ): void {
    if (this.isChargingStationConfigurationCacheable(chargingStationConfiguration)) {
      this.set(
        CacheType.CHARGING_STATION_CONFIGURATION + chargingStationConfiguration.configurationHash,
        chargingStationConfiguration
      );
    }
  }

  public getChargingStationConfiguration(
    chargingStationConfigurationHash: string
  ): ChargingStationConfiguration {
    return this.get(
      CacheType.CHARGING_STATION_CONFIGURATION + chargingStationConfigurationHash
    ) as ChargingStationConfiguration;
  }

  public deleteChargingStationConfiguration(chargingStationConfigurationHash: string): void {
    this.delete(CacheType.CHARGING_STATION_CONFIGURATION + chargingStationConfigurationHash);
  }

  public hasChargingStationTemplate(chargingStationTemplateHash: string): boolean {
    return this.has(CacheType.CHARGING_STATION_TEMPLATE + chargingStationTemplateHash);
  }

  public setChargingStationTemplate(chargingStationTemplate: ChargingStationTemplate): void {
    this.set(
      CacheType.CHARGING_STATION_TEMPLATE + chargingStationTemplate.templateHash,
      chargingStationTemplate
    );
  }

  public getChargingStationTemplate(chargingStationTemplateHash: string): ChargingStationTemplate {
    return this.get(
      CacheType.CHARGING_STATION_TEMPLATE + chargingStationTemplateHash
    ) as ChargingStationTemplate;
  }

  public deleteChargingStationTemplate(chargingStationTemplateHash: string): void {
    this.delete(CacheType.CHARGING_STATION_TEMPLATE + chargingStationTemplateHash);
  }

  public clear(): void {
    this.lruCache.clear();
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
      !Utils.isNullOrUndefined(chargingStationConfiguration?.configurationKey) &&
      !Utils.isNullOrUndefined(chargingStationConfiguration?.stationInfo) &&
      !Utils.isNullOrUndefined(chargingStationConfiguration?.configurationHash) &&
      !Utils.isEmptyArray(chargingStationConfiguration?.configurationKey) &&
      !Utils.isEmptyObject(chargingStationConfiguration?.stationInfo) &&
      !Utils.isEmptyString(chargingStationConfiguration?.configurationHash)
    );
  }
}
