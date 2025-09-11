/* eslint-disable @typescript-eslint/no-explicit-any */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity()
export class Template {
  @Column({ nullable: true, type: 'varchar' })
  amperageLimitationOcppKey?: string

  @Column({ nullable: true, type: 'jsonb' })
  AutomaticTransactionGenerator?: Record<string, any>

  @Column({ nullable: true, type: 'varchar' })
  baseName?: string

  @Column({ nullable: true, type: 'varchar' })
  chargeBoxSerialNumberPrefix?: string

  @Column({ nullable: true, type: 'varchar' })
  chargePointModel?: string

  @Column({ nullable: true, type: 'varchar' })
  chargePointVendor?: string

  @Column({ nullable: true, type: 'jsonb' })
  Configuration?: Record<string, any>

  @Column({ nullable: true, type: 'jsonb' })
  Connectors?: Record<string, any>

  @Column({ nullable: true, type: 'varchar' })
  firmwareVersion?: string

  @Column({ nullable: true, type: 'varchar' })
  firmwareVersionPattern?: string

  @PrimaryGeneratedColumn()
  id!: number

  @Column({ nullable: true, type: 'varchar' })
  idTagsFile?: string

  @Column({ type: 'varchar', unique: true })
  name!: string

  @Column({ nullable: true, type: 'int' })
  numberOfConnectors?: number

  @Column({ nullable: true, type: 'int' })
  power?: number

  @Column({ nullable: true, type: 'varchar' })
  powerUnit?: string

  @Column({ nullable: true, type: 'boolean' })
  randomConnectors?: boolean

  @Column({ default: false, type: 'boolean' })
  supervisionUrlOcppConfiguration!: boolean

  @Column({ nullable: true, type: 'varchar' })
  supervisionUrlOcppKey?: string

  @Column({ nullable: true, type: 'int' })
  voltageOut?: number
}
