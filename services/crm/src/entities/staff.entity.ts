import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Tenant } from './tenant.entity';

export enum StaffRole {
  STYLIST = 'STYLIST',
  BARBER = 'BARBER',
  COLORIST = 'COLORIST',
  MANICURIST = 'MANICURIST',
  ESTHETICIAN = 'ESTHETICIAN',
  MASSEUR = 'MASSEUR',
  OTHER = 'OTHER',
}

@Entity('staff')
export class Staff extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({
    type: 'enum',
    enum: StaffRole,
    default: StaffRole.STYLIST,
  })
  role: StaffRole;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'jsonb', nullable: true })
  availability?: Record<string, any>; // Schedule config, e.g., { "monday": { "start": "09:00", "end": "18:00" } }

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // Additional info like specialties, bio, photo_url, etc.
}
