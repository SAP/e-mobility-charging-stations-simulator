// Copyright Jerome Benoit. 2021. All Rights Reserved.

import { Configuration, Connection, IDatabaseDriver, MikroORM, Options } from '@mikro-orm/core';
import { MikroORMDBType, StorageType } from '../../types/Storage';

import Constants from '../../utils/Constants';
import { PerformanceData } from '../../types/orm/entities/PerformanceData';
import { PerformanceRecord } from '../../types/orm/entities/PerformanceRecord';
import Statistics from '../../types/Statistics';
import { Storage } from './Storage';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

export class MikroORMStorage extends Storage {
  private storageType: StorageType;
  private orm: MikroORM;

  constructor(storageURI: string, logPrefix: string, storageType: StorageType) {
    super(storageURI, logPrefix);
    this.storageType = storageType;
    this.dbName = this.getDBName();
  }

  public async storePerformanceStatistics(performanceStatistics: Statistics): Promise<void> {
    try {
      const performanceRecord = new PerformanceRecord();
      await this.orm.em.persistAndFlush(performanceRecord);
    } catch (error) {
      this.handleDBError(this.storageType, error, Constants.PERFORMANCE_RECORDS_TABLE);
    }
  }

  public async open(): Promise<void> {
    this.orm = await MikroORM.init(this.getOptions(), true);
  }

  public async close(): Promise<void> {
    await this.orm.close();
  }

  private getDBName(): string {
    if (this.storageType === StorageType.SQLITE) {
      return `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`;
    }
    return this.storageURI.pathname.replace(/(?:^\/)|(?:\/$)/g, '') ?? Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME;
  }

  private getOptions(): Configuration<IDatabaseDriver<Connection>> | Options<IDatabaseDriver<Connection>> {
    return {
      metadataProvider: TsMorphMetadataProvider,
      entities: [PerformanceRecord, PerformanceData],
      type: this.storageType as MikroORMDBType,
      clientUrl: this.getClientUrl()
    };
  }

  private getClientUrl(): string {
    switch (this.storageType) {
      case StorageType.SQLITE:
      case StorageType.MARIA_DB:
      case StorageType.MYSQL:
        return this.storageURI.toString();
    }
  }
}

