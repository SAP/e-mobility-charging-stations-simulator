import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core';

import { PerformanceData } from './PerformanceData';

@Entity()
export class PerformanceRecord {
  // @PrimaryKey()
  // pk!: number;

  // @Property()
  // id!: string;

  // @Property()
  // URI!: string;

  // @Property()
  // createdAt!: Date;

  // @Property()
  // updatedAt?: Date;

  // @OneToMany('PerformanceData', 'performanceRecord')
  // performanceData?= new Collection<PerformanceData>(this);
}

