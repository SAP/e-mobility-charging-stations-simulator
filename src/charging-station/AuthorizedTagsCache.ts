import fs from 'node:fs';

import { type ChargingStation, ChargingStationUtils } from './internal';
import { FileType, IdTagDistribution } from '../types';
import { FileUtils, Utils, logger } from '../utils';

type TagsCacheValueType = {
  tags: string[];
  tagsFileWatcher: fs.FSWatcher | undefined;
};

export class AuthorizedTagsCache {
  private static instance: AuthorizedTagsCache | null = null;
  private readonly tagsCaches: Map<string, TagsCacheValueType>;
  private readonly tagsCachesAddressableIndexes: Map<string, number>;

  private constructor() {
    this.tagsCaches = new Map<string, TagsCacheValueType>();
    this.tagsCachesAddressableIndexes = new Map<string, number>();
  }

  public static getInstance(): AuthorizedTagsCache {
    if (AuthorizedTagsCache.instance === null) {
      AuthorizedTagsCache.instance = new AuthorizedTagsCache();
    }
    return AuthorizedTagsCache.instance;
  }

  public getIdTag(
    distribution: IdTagDistribution,
    chargingStation: ChargingStation,
    connectorId: number
  ): string {
    const hashId = chargingStation.stationInfo.hashId;
    const authorizationFile = ChargingStationUtils.getAuthorizationFile(
      chargingStation.stationInfo
    );
    switch (distribution) {
      case IdTagDistribution.RANDOM:
        return this.getRandomIdTag(hashId, authorizationFile);
      case IdTagDistribution.ROUND_ROBIN:
        return this.getRoundRobinIdTag(hashId, authorizationFile);
      case IdTagDistribution.CONNECTOR_AFFINITY:
        return this.getConnectorAffinityIdTag(chargingStation, connectorId);
      default:
        return this.getRoundRobinIdTag(hashId, authorizationFile);
    }
  }

  public getAuthorizedTags(file: string): string[] | undefined {
    if (this.hasTags(file) === false) {
      this.setTags(file, this.getAuthorizedTagsFromFile(file));
    }
    return this.getTags(file);
  }

  public deleteAuthorizedTags(file: string): boolean {
    return this.deleteTags(file);
  }

  private getRandomIdTag(hashId: string, file: string): string {
    const tags = this.getAuthorizedTags(file);
    const addressableKey = file + hashId;
    this.tagsCachesAddressableIndexes.set(
      addressableKey,
      Math.floor(Utils.secureRandom() * tags.length)
    );
    return tags[this.tagsCachesAddressableIndexes.get(addressableKey)];
  }

  private getRoundRobinIdTag(hashId: string, file: string): string {
    const tags = this.getAuthorizedTags(file);
    const addressableKey = file + hashId;
    const idTagIndex = this.tagsCachesAddressableIndexes.get(addressableKey) ?? 0;
    const idTag = tags[idTagIndex];
    this.tagsCachesAddressableIndexes.set(
      addressableKey,
      idTagIndex === tags.length - 1 ? 0 : idTagIndex + 1
    );
    return idTag;
  }

  private getConnectorAffinityIdTag(chargingStation: ChargingStation, connectorId: number): string {
    const file = ChargingStationUtils.getAuthorizationFile(chargingStation.stationInfo);
    const tags = this.getAuthorizedTags(file);
    const hashId = chargingStation.stationInfo.hashId;
    const addressableKey = file + hashId;
    this.tagsCachesAddressableIndexes.set(
      addressableKey,
      (chargingStation.index - 1 + (connectorId - 1)) % tags.length
    );
    return tags[this.tagsCachesAddressableIndexes.get(addressableKey)];
  }

  private hasTags(file: string): boolean {
    return this.tagsCaches.has(file);
  }

  private setTags(file: string, tags: string[]) {
    return this.tagsCaches.set(file, {
      tags,
      tagsFileWatcher: FileUtils.watchJsonFile(
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
              this.deleteTags(file);
              this.deleteTagsIndexes(file);
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

  private getTags(file: string): string[] | undefined {
    return this.tagsCaches.get(file)?.tags;
  }

  private deleteTags(file: string): boolean {
    this.tagsCaches.get(file)?.tagsFileWatcher?.close();
    return this.tagsCaches.delete(file);
  }

  private deleteTagsIndexes(file: string): void {
    for (const [key] of this.tagsCachesAddressableIndexes) {
      if (key.startsWith(file)) {
        this.tagsCachesAddressableIndexes.delete(key);
      }
    }
  }

  private getAuthorizedTagsFromFile(file: string): string[] {
    let authorizedTags: string[] = [];
    if (file) {
      try {
        // Load authorization file
        authorizedTags = JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
      } catch (error) {
        FileUtils.handleFileException(
          file,
          FileType.Authorization,
          error as NodeJS.ErrnoException,
          this.logPrefix(file)
        );
      }
    } else {
      logger.info(`${this.logPrefix(file)} No authorization file given`);
    }
    return authorizedTags;
  }

  private logPrefix = (file: string): string => {
    return Utils.logPrefix(` Authorized tags cache for authorization file '${file}' |`);
  };
}
