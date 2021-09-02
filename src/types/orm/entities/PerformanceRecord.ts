import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

import { PerformanceData } from './PerformanceData';

@Entity()
export class PerformanceRecord {
  // @PrimaryKey()
  // pk!: number;

  // @Property()
  // id: string;

  // @Property()
  // URI: string;

  // @Property()
  // createdAt: Date;

  // @Property({ nullable: true })
  // updatedAt?: Date;

  // @Property({ nullable: true })
  // performanceData?: PerformanceData[];
}

