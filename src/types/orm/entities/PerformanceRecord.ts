// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { PerformanceData } from './PerformanceData.js'

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
  // performanceData? = new Collection<PerformanceData>(this);
}
