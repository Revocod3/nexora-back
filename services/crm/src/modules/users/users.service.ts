import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Tenant } from '../../entities';
import { UpsertUserDto } from '../../dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
  ) {}

  async upsertUser(
    dto: UpsertUserDto,
    idempotencyKey: string,
  ): Promise<{ id: string; created: boolean }> {
    // Resolve tenant: use provided tenant_id, or default to first active tenant
    let tenant: Tenant | null = null;

    if (dto.tenant_id) {
      // Use explicit tenant_id from request
      tenant = await this.tenantsRepository.findOne({
        where: { id: dto.tenant_id },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant with ID ${dto.tenant_id} not found`);
      }
    } else {
      // Default to first active tenant
      tenant = await this.tenantsRepository.findOne({
        where: { status: 'active' as any },
        order: { created_at: 'ASC' },
      });

      if (!tenant) {
        throw new NotFoundException(
          'No active tenants found. Please create a tenant first or specify tenant_id.',
        );
      }
    }

    // Check if user already exists (by email if provided)
    let existingUser: User | null = null;
    if (dto.email) {
      existingUser = await this.usersRepository.findOne({
        where: { email: dto.email },
        relations: ['tenant'],
      });
    }

    if (existingUser) {
      // Update existing user
      Object.assign(existingUser, dto);
      await this.usersRepository.save(existingUser);
      return { id: existingUser.id, created: false };
    } else {
      // Create new user
      const newUser = this.usersRepository.create({
        ...dto,
        tenant,
      });
      const savedUser = await this.usersRepository.save(newUser);
      return { id: savedUser.id, created: true };
    }
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['tenant', 'conversations'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['tenant', 'conversations'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }
}
