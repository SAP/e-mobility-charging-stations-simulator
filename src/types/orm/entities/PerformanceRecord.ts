import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core'

import { PerformanceData } from './PerformanceData.js'

@Entity()
export class PerformanceRecord {
  @PrimaryKey()
    id!: string

  @Property()
    name!: string

  @Property()
    uri!: string

  @Property()
    createdAt!: Date

  @Property()
    updatedAt?: Date

  @OneToMany(() => PerformanceData, performanceData => performanceData.performanceRecord)
    performanceData? = new Collection<PerformanceData>(this)
}
