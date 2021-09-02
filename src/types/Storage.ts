import { Configuration } from '@mikro-orm/core';

export type MikroORMDBType = keyof typeof Configuration.PLATFORMS;

export enum StorageType {
  JSON_FILE = 'jsonfile',
  MONGO_DB = 'mongodb',
  MYSQL = 'mysql',
  MARIA_DB = 'mariadb',
  SQLITE = 'sqlite'
}

export enum DBName {
  MONGO_DB = 'MongoDB',
  MYSQL = 'MySQL',
  MARIA_DB = 'MariaDB',
  SQLITE = 'SQLite'
}

