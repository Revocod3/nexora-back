import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { User } from './user.entity';

export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('tenants')
export class Tenant extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ nullable: true, length: 255 })
  subdomain?: string;

  @Column({ nullable: true, length: 20 })
  whatsapp_number?: string;

  @Column({ type: 'jsonb', nullable: true })
  config_json?: Record<string, any>;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status!: TenantStatus;

  // Relations
  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];
}
