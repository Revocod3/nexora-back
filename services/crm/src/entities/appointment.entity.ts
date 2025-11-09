import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Service } from './service.entity';
import { Staff } from './staff.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

@Entity('appointments')
export class Appointment extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => Service)
  @JoinColumn({ name: 'service_id' })
  service!: Service;

  @ManyToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

  @Column({ type: 'timestamp' })
  scheduled_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at?: Date;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.PENDING,
  })
  status!: AppointmentStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  cancellation_reason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ length: 255, nullable: true })
  customer_name?: string;

  @Column({ length: 20, nullable: true })
  customer_phone?: string;

  @Column({ type: 'boolean', default: false })
  reminder_sent?: boolean;

  @Column({ type: 'timestamp', nullable: true })
  reminder_sent_at?: Date;
}
