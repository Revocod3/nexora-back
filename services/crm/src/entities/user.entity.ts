import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';
import { Conversation } from './conversation.entity';

export enum UserStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CONVERTED = 'converted',
  LOST = 'lost',
}

@Entity('users')
export class User extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.users)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

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
    enum: UserStatus,
    default: UserStatus.NEW,
  })
  status!: UserStatus;

  @Column({ type: 'float', nullable: true })
  qualification_score?: number;

  // Relations
  @OneToMany(() => Conversation, (conv) => conv.user)
  conversations!: Conversation[];
}
