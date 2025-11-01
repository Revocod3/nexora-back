import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Lead } from './lead.entity';

export enum ConsentType {
  MARKETING = 'marketing',
  DATA_PROCESSING = 'data_processing',
  COMMUNICATION = 'communication',
  ANALYTICS = 'analytics',
}

export enum ConsentStatus {
  GRANTED = 'granted',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('consents')
@Index(['lead', 'type'], { unique: true })
export class Consent extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'lead_id' })
  lead!: Lead;

  @Column({
    type: 'enum',
    enum: ConsentType,
  })
  type!: ConsentType;

  @Column({
    type: 'enum',
    enum: ConsentStatus,
    default: ConsentStatus.GRANTED,
  })
  status!: ConsentStatus;

  @Column({ type: 'text', nullable: true })
  consent_text?: string;

  @Column({ type: 'inet', nullable: true })
  ip_address?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent?: string;

  @Column({ type: 'timestamp', nullable: true })
  granted_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expires_at?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
