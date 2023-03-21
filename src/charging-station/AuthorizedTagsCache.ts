import fs from 'node:fs';

import { FileType } from '../types';
import { FileUtils, Utils, logger } from '../utils';

type TagsCacheValueType = {
  tags: string[];
  tagsFileWatcher: fs.FSWatcher | undefined;
};

export class AuthorizedTagsCache {
  private static instance: AuthorizedTagsCache | null = null;
  private readonly tagsCaches: Map<string, TagsCacheValueType>;

  private constructor() {
    this.tagsCaches = new Map<string, TagsCacheValueType>();
  }

  public static getInstance(): AuthorizedTagsCache {
    if (AuthorizedTagsCache.instance === null) {
      AuthorizedTagsCache.instance = new AuthorizedTagsCache();
    }
    return AuthorizedTagsCache.instance;
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
