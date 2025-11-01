import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Client } from './client.entity';

export enum ContactType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  BILLING = 'billing',
  TECHNICAL = 'technical',
}

@Entity('contacts')
export class Contact extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Client, (client) => client.contacts)
  @JoinColumn({ name: 'client_id' })
  client!: Client;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 255 })
  email!: string;

  @Column({ nullable: true, length: 20 })
  phone?: string;

  @Column({
    type: 'enum',
    enum: ContactType,
    default: ContactType.PRIMARY,
  })
  type!: ContactType;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
