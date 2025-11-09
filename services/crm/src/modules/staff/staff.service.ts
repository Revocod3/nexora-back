import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Staff } from '../../entities';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
  ) {}

  async create(tenantId: string, dto: CreateStaffDto) {
    const staff = this.staffRepository.create({
      ...dto,
      tenant_id: tenantId,
    });

    return this.staffRepository.save(staff);
  }

  async findAll(tenantId: string) {
    return this.staffRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });
  }

  async findAllActive(tenantId: string) {
    return this.staffRepository.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const staff = await this.staffRepository.findOne({
      where: { id, tenant_id: tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    return staff;
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    const staff = await this.findOne(tenantId, id);

    Object.assign(staff, dto);

    return this.staffRepository.save(staff);
  }

  async remove(tenantId: string, id: string) {
    const staff = await this.findOne(tenantId, id);
    await this.staffRepository.remove(staff);
    return { message: 'Staff member deleted successfully' };
  }

  async deactivate(tenantId: string, id: string) {
    const staff = await this.findOne(tenantId, id);
    staff.is_active = false;
    await this.staffRepository.save(staff);
    return staff;
  }
}
