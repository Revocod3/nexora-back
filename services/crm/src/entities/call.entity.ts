import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum CallDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

export enum CallStatus {
  QUEUED = 'queued',
  INITIATED = 'initiated',
  RINGING = 'ringing',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BUSY = 'busy',
  NO_ANSWER = 'no-answer',
  CANCELED = 'canceled',
}

export enum CallOutcome {
  QUALIFIED = 'qualified',
  NOT_INTERESTED = 'not_interested',
  CALLBACK = 'callback',
  NO_ANSWER = 'no_answer',
  WRONG_NUMBER = 'wrong_number',
  VOICEMAIL = 'voicemail',
  BOOKED_DEMO = 'booked_demo',
}

@Entity('calls')
export class Call extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'enum',
    enum: CallDirection,
    default: CallDirection.OUTBOUND,
  })
  direction!: CallDirection;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.QUEUED,
  })
  status!: CallStatus;

  @Column({ length: 255, nullable: true })
  twilio_call_sid?: string;

  @Column({ length: 20 })
  from_number!: string;

  @Column({ length: 20 })
  to_number!: string;

  @Column({ type: 'timestamp', nullable: true })
  started_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  ended_at?: Date;

  @Column({ type: 'integer', nullable: true })
  duration_seconds?: number;

  @Column({ type: 'jsonb', nullable: true })
  conversation_transcript?: {
    role: 'assistant' | 'user';
    content: string;
    timestamp: string;
  }[];

  @Column({ type: 'text', nullable: true })
  recording_url?: string;

  @Column({
    type: 'enum',
    enum: CallOutcome,
    nullable: true,
  })
  outcome?: CallOutcome;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'float', nullable: true })
  cost?: number;

  @Column({ type: 'text', nullable: true })
  error_message?: string;
}
