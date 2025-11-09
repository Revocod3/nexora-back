import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';

export enum TenantUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
}

@Entity('tenant_users')
@Index(['tenant', 'email'], { unique: true })
export class TenantUser extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  password_hash: string;

  @Column({
    type: 'enum',
    enum: TenantUserRole,
    default: TenantUserRole.OWNER,
  })
  role: TenantUserRole;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at?: Date;
}
