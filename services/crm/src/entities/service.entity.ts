import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';
import { Appointment } from './appointment.entity';

export enum ServiceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('services')
export class Service extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'integer' })
  duration_minutes!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ length: 3, default: 'EUR' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: ServiceStatus,
    default: ServiceStatus.ACTIVE,
  })
  status!: ServiceStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relations
  @OneToMany(() => Appointment, (appointment) => appointment.service)
  appointments!: Appointment[];
}
