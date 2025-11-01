import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Client } from './client.entity';
import { Conversation } from './conversation.entity';

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CONVERTED = 'converted',
  LOST = 'lost',
}

@Entity('leads')
export class Lead extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Client, (client) => client.leads)
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @Column({ length: 255 })
  name!: string;

  @Column({ nullable: true, length: 255 })
  email?: string;

  @Column({ nullable: true, length: 20 })
  phone_e164?: string;

  @Column({ nullable: true, length: 255 })
  utm_source?: string;

  @Column({ nullable: true, length: 255 })
  utm_campaign?: string;

  @Column({ type: 'text', nullable: true })
  consent_text?: string;

  @Column({ type: 'inet', nullable: true })
  consent_ip?: string;

  @Column({ type: 'timestamp', nullable: true })
  consent_ts?: Date;

  @Column({
    type: 'enum',
    enum: LeadStatus,
    default: LeadStatus.NEW,
  })
  status!: LeadStatus;

  @Column({ type: 'float', nullable: true })
  qualification_score?: number;

  // Relations
  @OneToMany(() => Conversation, (conv) => conv.lead)
  conversations!: Conversation[];
}
