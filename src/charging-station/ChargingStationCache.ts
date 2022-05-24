import ChargingStationConfiguration from '../types/ChargingStationConfiguration';
import ChargingStationTemplate from '../types/ChargingStationTemplate';
import { ChargingStationUtils } from './ChargingStationUtils';
import LRUCache from 'mnemonist/lru-map-with-delete';

enum CacheType {
  CHARGING_STATION_TEMPLATE = 'chargingStationTemplate',
  CHARGING_STATION_CONFIGURATION = 'chargingStationConfiguration',
}

export class ChargingStationCache {
  private static instance: ChargingStationCache | null = null;
  private readonly lruCache: LRUCache<string, any>;

  private constructor() {
    this.lruCache = new LRUCache<string, any>(1000);
  }

  public static getInstance(): ChargingStationCache {
    if (!ChargingStationCache.instance) {
      ChargingStationCache.instance = new ChargingStationCache();
    }
    return ChargingStationCache.instance;
  }

  public hasChargingStationConfiguration(chargingStationConfigurationHash: string): boolean {
    return this.has(CacheType.CHARGING_STATION_CONFIGURATION + chargingStationConfigurationHash);
  }

  public setChargingStationConfiguration(
    chargingStationConfiguration: ChargingStationConfiguration
  ): void {
    if (
      ChargingStationUtils.isChargingStationConfigurationCacheable(chargingStationConfiguration)
    ) {
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

  private get(key: string): any {
    return this.lruCache.get(key);
  }

  private set(key: string, value: any): void {
    this.lruCache.set(key, value);
  }

  private delete(key: string): void {
    this.lruCache.delete(key);
  }
}
