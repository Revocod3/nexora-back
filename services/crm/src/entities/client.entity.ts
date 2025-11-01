import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Lead } from './lead.entity';
import { Contact } from './contact.entity';

export enum ClientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('clients')
export class Client extends BaseEntityWithTimestamps {
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
    enum: ClientStatus,
    default: ClientStatus.ACTIVE,
  })
  status!: ClientStatus;

  // Relations
  @OneToMany(() => Lead, (lead) => lead.client)
  leads!: Lead[];

  @OneToMany(() => Contact, (contact) => contact.client)
  contacts!: Contact[];
}
