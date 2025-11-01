import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service, Client, ServiceStatus } from '../../entities';

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
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
  ) {}

  async create(clientId: string, dto: CreateServiceDto): Promise<Service> {
    const client = await this.clientsRepository.findOne({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    const service = this.servicesRepository.create({
      ...dto,
      client,
      currency: dto.currency || 'EUR',
      status: ServiceStatus.ACTIVE,
    });

    return this.servicesRepository.save(service);
  }

  async findByClient(clientId: string): Promise<Service[]> {
    return this.servicesRepository.find({
      where: {
        client: { id: clientId },
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
      relations: ['client'],
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
