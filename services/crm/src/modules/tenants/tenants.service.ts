import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../entities';
import { CreateTenantDto, UpdateTenantDto } from '../../dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
  ) {}

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantsRepository.create(createTenantDto);
    return this.tenantsRepository.save(tenant);
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantsRepository.find({
      relations: ['users'],
    });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantsRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);
    Object.assign(tenant, updateTenantDto);
    return this.tenantsRepository.save(tenant);
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantsRepository.remove(tenant);
  }

  async getOrCreateDefault(): Promise<{ tenantId: string; created: boolean }> {
    // Try to find existing default tenant
    let tenant = await this.tenantsRepository.findOne({
      where: { email: 'default@nexora.app' },
    });

    if (tenant) {
      return { tenantId: tenant.id, created: false };
    }

    // Create default tenant if it doesn't exist
    tenant = this.tenantsRepository.create({
      name: 'Default Tenant',
      email: 'default@nexora.app',
      status: 'active' as any,
    });

    await this.tenantsRepository.save(tenant);
    return { tenantId: tenant.id, created: true };
  }
}
