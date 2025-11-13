import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';
import { Staff } from './staff.entity';

/**
 * Stores Google Calendar OAuth2 credentials for staff members
 * Each staff member can have their own Google Calendar connected
 */
@Entity('google_calendar_credentials')
@Unique(['staff_id'])
export class GoogleCalendarCredentials extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Staff, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff: Staff;

  @Column()
  staff_id: string;

  // OAuth2 tokens
  @Column({ type: 'text' })
  access_token: string;

  @Column({ type: 'text', nullable: true })
  refresh_token?: string;

  @Column({ type: 'timestamp', nullable: true })
  token_expiry_date?: Date;

  // Google Calendar ID where events will be created
  @Column({ default: 'primary' })
  calendar_id: string;

  // Channel ID for push notifications (Google Calendar webhooks)
  @Column({ nullable: true })
  watch_channel_id?: string;

  @Column({ nullable: true })
  watch_resource_id?: string;

  @Column({ type: 'timestamp', nullable: true })
  watch_expiration?: Date;

  @Column({ default: true })
  sync_enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // Additional config
}
