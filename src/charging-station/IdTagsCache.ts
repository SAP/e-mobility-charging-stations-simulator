import { type FSWatcher, readFileSync } from 'node:fs';

import type { ChargingStation } from './ChargingStation';
import { getIdTagsFile } from './ChargingStationUtils';
import { FileType, IdTagDistribution } from '../types';
import {
  handleFileException,
  isNotEmptyString,
  logPrefix,
  logger,
  secureRandom,
  watchJsonFile,
} from '../utils';

type IdTagsCacheValueType = {
  idTags: string[];
  idTagsFileWatcher: FSWatcher | undefined;
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

  /**
   * Gets one idtag from the cache given the distribution
   * Must be called after checking the cache is not an empty array
   *
   * @param distribution -
   * @param chargingStation -
   * @param connectorId -
   * @returns
   */
  public getIdTag(
    distribution: IdTagDistribution,
    chargingStation: ChargingStation,
    connectorId: number,
  ): string {
    const hashId = chargingStation.stationInfo.hashId;
    const idTagsFile = getIdTagsFile(chargingStation.stationInfo);
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

  /**
   * Gets all idtags from the cache
   * Must be called after checking the cache is not an empty array
   *
   * @param file -
   * @returns
   */
  public getIdTags(file: string): string[] | undefined {
    if (this.hasIdTagsCache(file) === false) {
      this.setIdTagsCache(file, this.getIdTagsFromFile(file));
    }
    return this.getIdTagsCache(file);
  }

  public deleteIdTags(file: string): boolean {
    return this.deleteIdTagsCache(file) && this.deleteIdTagsCacheIndexes(file);
  }

  private getRandomIdTag(hashId: string, file: string): string {
    const idTags = this.getIdTags(file);
    const addressableKey = this.getIdTagsCacheIndexesAddressableKey(file, hashId);
    this.idTagsCachesAddressableIndexes.set(
      addressableKey,
      Math.floor(secureRandom() * idTags.length),
    );
    return idTags[this.idTagsCachesAddressableIndexes.get(addressableKey)];
  }

  private getRoundRobinIdTag(hashId: string, file: string): string {
    const idTags = this.getIdTags(file);
    const addressableKey = this.getIdTagsCacheIndexesAddressableKey(file, hashId);
    const idTagIndex = this.idTagsCachesAddressableIndexes.get(addressableKey) ?? 0;
    const idTag = idTags[idTagIndex];
    this.idTagsCachesAddressableIndexes.set(
      addressableKey,
      idTagIndex === idTags.length - 1 ? 0 : idTagIndex + 1,
    );
    return idTag;
  }

  private getConnectorAffinityIdTag(chargingStation: ChargingStation, connectorId: number): string {
    const file = getIdTagsFile(chargingStation.stationInfo);
    const idTags = this.getIdTags(file);
    const addressableKey = this.getIdTagsCacheIndexesAddressableKey(
      file,
      chargingStation.stationInfo.hashId,
    );
    this.idTagsCachesAddressableIndexes.set(
      addressableKey,
      (chargingStation.index - 1 + (connectorId - 1)) % idTags.length,
    );
    return idTags[this.idTagsCachesAddressableIndexes.get(addressableKey)];
  }

  private hasIdTagsCache(file: string): boolean {
    return this.idTagsCaches.has(file);
  }

  private setIdTagsCache(file: string, idTags: string[]) {
    return this.idTagsCaches.set(file, {
      idTags,
      idTagsFileWatcher: watchJsonFile(
        file,
        FileType.Authorization,
        this.logPrefix(file),
        undefined,
        (event, filename) => {
          if (isNotEmptyString(filename) && event === 'change') {
            try {
              logger.debug(
                `${this.logPrefix(file)} ${FileType.Authorization} file have changed, reload`,
              );
              this.deleteIdTagsCache(file);
              this.deleteIdTagsCacheIndexes(file);
            } catch (error) {
              handleFileException(
                file,
                FileType.Authorization,
                error as NodeJS.ErrnoException,
                this.logPrefix(file),
                {
                  throwError: false,
                },
              );
            }
          }
        },
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

  private deleteIdTagsCacheIndexes(file: string): boolean {
    let deleted: boolean[];
    for (const [key] of this.idTagsCachesAddressableIndexes) {
      if (key.startsWith(file)) {
        deleted.push(this.idTagsCachesAddressableIndexes.delete(key));
      }
    }
    return !deleted.some((value) => value === false);
  }

  private getIdTagsCacheIndexesAddressableKey(prefix: string, uid: string): string {
    return `${prefix}${uid}`;
  }

  private getIdTagsFromFile(file: string): string[] {
    if (isNotEmptyString(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as string[];
      } catch (error) {
        handleFileException(
          file,
          FileType.Authorization,
          error as NodeJS.ErrnoException,
          this.logPrefix(file),
        );
      }
    }
    return [];
  }

  private logPrefix = (file: string): string => {
    return logPrefix(` Id tags cache for id tags file '${file}' |`);
  };
}
