import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'performance_records' })
export class PerformanceRecord {
  @Property({ type: 'datetime' })
  createdAt!: Date

  @PrimaryKey({ type: 'string' })
  id!: string

  @Property({ type: 'string' })
  name!: string

  @Property({ type: 'json' })
  statisticsData!: Record<string, unknown>[]

  @Property({ nullable: true, type: 'datetime' })
  updatedAt?: Date

  @Property({ type: 'string' })
  uri!: string
}
