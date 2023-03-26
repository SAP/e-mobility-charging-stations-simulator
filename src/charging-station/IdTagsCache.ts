import fs from 'node:fs';

import { type ChargingStation, ChargingStationUtils } from './internal';
import { FileType, IdTagDistribution } from '../types';
import { FileUtils, Utils, logger } from '../utils';

type IdTagsCacheValueType = {
  idTags: string[];
  idTagsFileWatcher: fs.FSWatcher | undefined;
};

export class IdTagsCache {
  private static instance: IdTagsCache | null = null;
  private readonly idTagsCaches: Map<string, IdTagsCacheValueType>;
  private readonly idTagsCachesAddressableIndexes: Map<string, number>;

  private constructor() {
    this.idTagsCaches = new Map<string, IdTagsCacheValueType>();
    this.idTagsCachesAddressableIndexes = new Map<string, number>();
  }

  public static getInstance(): IdTagsCache {
    if (IdTagsCache.instance === null) {
      IdTagsCache.instance = new IdTagsCache();
    }
    return IdTagsCache.instance;
  }

  public getIdTag(
    distribution: IdTagDistribution,
    chargingStation: ChargingStation,
    connectorId: number
  ): string {
    const hashId = chargingStation.stationInfo.hashId;
    const idTagsFile = ChargingStationUtils.getIdTagsFile(chargingStation.stationInfo);
    switch (distribution) {
      case IdTagDistribution.RANDOM:
        return this.getRandomIdTag(hashId, idTagsFile);
      case IdTagDistribution.ROUND_ROBIN:
        return this.getRoundRobinIdTag(hashId, idTagsFile);
      case IdTagDistribution.CONNECTOR_AFFINITY:
        return this.getConnectorAffinityIdTag(chargingStation, connectorId);
      default:
        return this.getRoundRobinIdTag(hashId, idTagsFile);
    }
  }

  public getIdTags(file: string): string[] | undefined {
    if (this.hasIdTagsCache(file) === false) {
      this.setIdTagsCache(file, this.getIdTagsFromFile(file));
    }
    return this.getIdTagsCache(file);
  }

  public deleteIdTags(file: string): boolean {
    return this.deleteIdTagsCache(file);
  }

  private getRandomIdTag(hashId: string, file: string): string {
    const idTags = this.getIdTags(file);
    const addressableKey = file + hashId;
    this.idTagsCachesAddressableIndexes.set(
      addressableKey,
      Math.floor(Utils.secureRandom() * idTags.length)
    );
    return idTags[this.idTagsCachesAddressableIndexes.get(addressableKey)];
  }

  private getRoundRobinIdTag(hashId: string, file: string): string {
    const idTags = this.getIdTags(file);
    const addressableKey = file + hashId;
    const idTagIndex = this.idTagsCachesAddressableIndexes.get(addressableKey) ?? 0;
    const idTag = idTags[idTagIndex];
    this.idTagsCachesAddressableIndexes.set(
      addressableKey,
      idTagIndex === idTags.length - 1 ? 0 : idTagIndex + 1
    );
    return idTag;
  }

  private getConnectorAffinityIdTag(chargingStation: ChargingStation, connectorId: number): string {
    const file = ChargingStationUtils.getIdTagsFile(chargingStation.stationInfo);
    const idTags = this.getIdTags(file);
    const hashId = chargingStation.stationInfo.hashId;
    const addressableKey = file + hashId;
    this.idTagsCachesAddressableIndexes.set(
      addressableKey,
      (chargingStation.index - 1 + (connectorId - 1)) % idTags.length
    );
    return idTags[this.idTagsCachesAddressableIndexes.get(addressableKey)];
  }

  private hasIdTagsCache(file: string): boolean {
    return this.idTagsCaches.has(file);
  }

  private setIdTagsCache(file: string, idTags: string[]) {
    return this.idTagsCaches.set(file, {
      idTags,
      idTagsFileWatcher: FileUtils.watchJsonFile(
        file,
        FileType.Authorization,
        this.logPrefix(file),
        undefined,
        (event, filename) => {
          if (Utils.isNotEmptyString(filename) && event === 'change') {
            try {
              logger.debug(
                `${this.logPrefix(file)} ${FileType.Authorization} file have changed, reload`
              );
              this.deleteIdTagsCache(file);
              this.deleteIdTagsCacheIndexes(file);
            } catch (error) {
              FileUtils.handleFileException(
                file,
                FileType.Authorization,
                error as NodeJS.ErrnoException,
                this.logPrefix(file),
                {
                  throwError: false,
                }
              );
            }
          }
        }
      ),
    });
  }

  private getIdTagsCache(file: string): string[] | undefined {
    return this.idTagsCaches.get(file)?.idTags;
  }

  private deleteIdTagsCache(file: string): boolean {
    this.idTagsCaches.get(file)?.idTagsFileWatcher?.close();
    return this.idTagsCaches.delete(file);
  }

  private deleteIdTagsCacheIndexes(file: string): void {
    for (const [key] of this.idTagsCachesAddressableIndexes) {
      if (key.startsWith(file)) {
        this.idTagsCachesAddressableIndexes.delete(key);
      }
    }
  }

  private getIdTagsFromFile(file: string): string[] {
    let idTags: string[] = [];
    if (file) {
      try {
        // Load id tags file
        idTags = JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
      } catch (error) {
        FileUtils.handleFileException(
          file,
          FileType.Authorization,
          error as NodeJS.ErrnoException,
          this.logPrefix(file)
        );
      }
    } else {
      logger.info(`${this.logPrefix(file)} No id tags file given`);
    }
    return idTags;
  }

  private logPrefix = (file: string): string => {
    return Utils.logPrefix(` Id tags cache for id tags file '${file}' |`);
  };
}
