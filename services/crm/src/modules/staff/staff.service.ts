import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Staff, Appointment, AppointmentStatus } from '../../entities';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepository: Repository<Appointment>,
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

  async getAvailability(tenantId: string, staffId: string, dateStr: string) {
    // Validate staff
    const staff = await this.findOne(tenantId, staffId);

    // Parse date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new NotFoundException('Invalid date format. Use YYYY-MM-DD');
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(9, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(18, 0, 0, 0);

    // Get staff appointments for that day
    const appointments = await this.appointmentsRepository.find({
      where: {
        staff: { id: staffId },
        scheduled_at: Between(startOfDay, endOfDay),
        status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
      },
      relations: ['service'],
    });

    // Generate available slots (every 30 minutes)
    const slots = [];
    let currentTime = new Date(startOfDay);

    while (currentTime < endOfDay) {
      const slotEnd = new Date(currentTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + 30);

      if (slotEnd <= endOfDay) {
        const isOccupied = appointments.some((apt) => {
          const aptStart = new Date(apt.scheduled_at);
          const aptEnd = new Date(aptStart);
          aptEnd.setMinutes(aptEnd.getMinutes() + apt.service.duration_minutes);

          return (
            (currentTime >= aptStart && currentTime < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (currentTime <= aptStart && slotEnd >= aptEnd)
          );
        });

        slots.push({
          start: currentTime.toISOString(),
          end: slotEnd.toISOString(),
          available: !isOccupied,
        });
      }

      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }

    return {
      staffId,
      staffName: staff.name,
      date: dateStr,
      totalSlots: slots.length,
      availableSlots: slots.filter(s => s.available).length,
      slots: slots.filter(s => s.available),
    };
  }
}
