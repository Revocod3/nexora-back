import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, Client } from '../../entities';
import { UpsertLeadDto } from '../../dto';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private leadsRepository: Repository<Lead>,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
  ) {}

  async upsertLead(
    dto: UpsertLeadDto,
    idempotencyKey: string,
  ): Promise<{ id: string; created: boolean }> {
    // For now, we'll create leads without a specific client
    // In a real implementation, you'd determine the client from the API key or request context
    let client: Client | null = null;

    // Try to find existing client or create a default one
    try {
      client = await this.clientsRepository.findOne({
        where: { email: 'default@realtec.com' },
      });

      if (!client) {
        client = this.clientsRepository.create({
          name: 'Default Client',
          email: 'default@realtec.com',
          status: 'active' as any,
        });
        await this.clientsRepository.save(client);
      }
    } catch (error) {
      // If client operations fail, we'll handle leads without client for now
      console.warn('Could not find/create client:', error);
    }

    // Check if lead already exists (by email if provided)
    let existingLead: Lead | null = null;
    if (dto.email) {
      existingLead = await this.leadsRepository.findOne({
        where: { email: dto.email },
        relations: ['client'],
      });
    }

    if (existingLead) {
      // Update existing lead
      Object.assign(existingLead, dto);
      await this.leadsRepository.save(existingLead);
      return { id: existingLead.id, created: false };
    } else {
      // Create new lead
      const newLead = this.leadsRepository.create({
        ...dto,
        client: client || undefined,
      });
      const savedLead = await this.leadsRepository.save(newLead);
      return { id: savedLead.id, created: true };
    }
  }

  async findAll(): Promise<Lead[]> {
    return this.leadsRepository.find({
      relations: ['client', 'conversations'],
    });
  }

  async findOne(id: string): Promise<Lead> {
    const lead = await this.leadsRepository.findOne({
      where: { id },
      relations: ['client', 'conversations'],
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }
}
