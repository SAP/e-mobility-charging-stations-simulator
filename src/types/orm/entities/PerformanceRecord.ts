import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'performance_records' })
export class PerformanceRecord {
  @Property()
  createdAt!: Date

  @PrimaryKey()
  id!: string

  @Property()
  name!: string

  @Property({ type: 'json' })
  statisticsData!: Record<string, unknown>[]

  @Property()
  updatedAt?: Date

  @Property()
  uri!: string
}
