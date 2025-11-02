import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service, Tenant, ServiceStatus } from '../../entities';

export interface CreateServiceDto {
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  currency?: string;
}

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
  ) {}

  async create(tenantId: string, dto: CreateServiceDto): Promise<Service> {
    const tenant = await this.tenantsRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const service = this.servicesRepository.create({
      ...dto,
      tenant,
      currency: dto.currency || 'EUR',
      status: ServiceStatus.ACTIVE,
    });

    return this.servicesRepository.save(service);
  }

  async findByClient(tenantId: string): Promise<Service[]> {
    return this.servicesRepository.find({
      where: {
        tenant: { id: tenantId },
        status: ServiceStatus.ACTIVE,
      },
      order: {
        name: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.servicesRepository.findOne({
      where: { id },
      relations: ['tenant'],
    });

    if (!service) {
      throw new NotFoundException(`Service with ID ${id} not found`);
    }

    return service;
  }

  async update(id: string, updates: Partial<CreateServiceDto>): Promise<Service> {
    const service = await this.findOne(id);
    Object.assign(service, updates);
    return this.servicesRepository.save(service);
  }

  async deactivate(id: string): Promise<Service> {
    const service = await this.findOne(id);
    service.status = ServiceStatus.INACTIVE;
    return this.servicesRepository.save(service);
  }
}
