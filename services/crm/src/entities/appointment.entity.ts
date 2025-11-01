import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Client } from './client.entity';
import { Lead } from './lead.entity';
import { Service } from './service.entity';

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

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @ManyToOne(() => Service)
  @JoinColumn({ name: 'service_id' })
  service!: Service;

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
