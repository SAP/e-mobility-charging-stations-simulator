import LRUCache from 'mnemonist/lru-map-with-delete';

import { Bootstrap } from './internal';
import type { ChargingStationConfiguration, ChargingStationTemplate } from '../types';
import { Utils } from '../utils';

enum CacheType {
  chargingStationTemplate = 'chargingStationTemplate',
  chargingStationConfiguration = 'chargingStationConfiguration',
}

type CacheableType = ChargingStationTemplate | ChargingStationConfiguration;

export class SharedLRUCache {
  private static instance: SharedLRUCache | null = null;
  private readonly lruCache: LRUCache<string, CacheableType>;

  private constructor() {
    this.lruCache = new LRUCache<string, CacheableType>(
      Bootstrap.getInstance().numberOfChargingStationTemplates +
        Bootstrap.getInstance().numberOfChargingStations
    );
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
    return `${CacheType.chargingStationConfiguration}${hash}`;
  }

  private getChargingStationTemplateKey(hash: string): string {
    return `${CacheType.chargingStationTemplate}${hash}`;
  }

  private has(key: string): boolean {
    return this.lruCache.has(key);
  }

  private get(key: string): CacheableType | undefined {
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
      Utils.isNotEmptyArray(chargingStationConfiguration?.configurationKey) === true &&
      Utils.isEmptyObject(chargingStationConfiguration?.stationInfo) === false &&
      Utils.isNotEmptyString(chargingStationConfiguration?.configurationHash) === true
    );
  }
}
