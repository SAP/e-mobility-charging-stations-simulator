// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import {
  Configuration,
  Connection,
  type IDatabaseDriver,
  MikroORM,
  type Options,
} from '@mikro-orm/core';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

import {
  type MikroOrmDbType,
  PerformanceData,
  PerformanceRecord,
  type Statistics,
  StorageType,
} from '../../types';
import { Constants } from '../../utils';
import { Storage } from '../internal';

export class MikroOrmStorage extends Storage {
  private storageType: StorageType;
  private orm!: MikroORM | null;

  constructor(storageUri: string, logPrefix: string, storageType: StorageType) {
    super(storageUri, logPrefix);
    this.storageType = storageType;
    this.dbName = this.getDBName();
  }

  public async storePerformanceStatistics(performanceStatistics: Statistics): Promise<void> {
    try {
      const performanceRecord = new PerformanceRecord();
      await this.orm?.em.persistAndFlush(performanceRecord);
    } catch (error) {
      this.handleDBError(this.storageType, error as Error, Constants.PERFORMANCE_RECORDS_TABLE);
    }
  }

  public async open(): Promise<void> {
    try {
      if (!this?.orm) {
        this.orm = await MikroORM.init(this.getOptions(), true);
      }
    } catch (error) {
      this.handleDBError(this.storageType, error as Error);
    }
  }

  public async close(): Promise<void> {
    try {
      if (this?.orm) {
        await this.orm.close();
        this.orm = null;
      }
    } catch (error) {
      this.handleDBError(this.storageType, error as Error);
    }
  }

  private getDBName(): string {
    if (this.storageType === StorageType.SQLITE) {
      return `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`;
    }
    return (
      this.storageUri.pathname.replace(/(?:^\/)|(?:\/$)/g, '') ??
      Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME
    );
  }

  private getOptions():
    | Configuration<IDatabaseDriver<Connection>>
    | Options<IDatabaseDriver<Connection>> {
    return {
      metadataProvider: TsMorphMetadataProvider,
      entities: [PerformanceRecord, PerformanceData],
      type: this.storageType as MikroOrmDbType,
      clientUrl: this.getClientUrl(),
    };
  }

  private getClientUrl(): string | undefined {
    switch (this.storageType) {
      case StorageType.SQLITE:
      case StorageType.MARIA_DB:
      case StorageType.MYSQL:
        return this.storageUri.toString();
    }
  }
}
