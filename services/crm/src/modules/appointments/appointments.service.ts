import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { Appointment, User, Service, Tenant, Staff, AppointmentStatus } from '../../entities';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';

export interface CreateAppointmentDto {
  userId?: string;
  serviceId: string;
  staffId?: string;
  scheduledAt: Date;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  available: boolean;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    private googleCalendarService: GoogleCalendarService,
  ) {}

  async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    const tenant = await this.tenantsRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const service = await this.servicesRepository.findOne({
      where: { id: dto.serviceId },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID ${dto.serviceId} not found`);
    }

    let user: User | undefined;
    if (dto.userId) {
      const foundLead = await this.usersRepository.findOne({
        where: { id: dto.userId },
      });
      if (!foundLead) {
        throw new NotFoundException(`User with ID ${dto.userId} not found`);
      }
      user = foundLead;
    }

    let staff: Staff | undefined;
    if (dto.staffId) {
      const foundStaff = await this.staffRepository.findOne({
        where: { id: dto.staffId, tenant_id: tenantId },
      });
      if (!foundStaff) {
        throw new NotFoundException(`Staff with ID ${dto.staffId} not found`);
      }
      staff = foundStaff;
    }

    // Check availability (considering staff if provided)
    const isAvailable = await this.checkSlotAvailability(
      tenantId,
      dto.scheduledAt,
      service.duration_minutes,
      dto.staffId,
    );

    if (!isAvailable) {
      throw new BadRequestException('The selected time slot is not available');
    }

    const appointment = this.appointmentsRepository.create({
      tenant,
      user,
      service,
      staff,
      scheduled_at: dto.scheduledAt,
      customer_name: dto.customerName || user?.name,
      customer_phone: dto.customerPhone || user?.phone_e164,
      notes: dto.notes,
      status: AppointmentStatus.PENDING,
    });

    const savedAppointment = await this.appointmentsRepository.save(appointment);

    // Sync to Google Calendar if staff is assigned
    if (savedAppointment.staff_id) {
      try {
        await this.googleCalendarService.createCalendarEvent(savedAppointment);
      } catch (error) {
        // Log error but don't fail the appointment creation
        console.error('Failed to sync appointment to Google Calendar:', error);
      }
    }

    return savedAppointment;
  }

  async findAvailableSlots(
    tenantId: string,
    serviceId: string,
    date: Date,
  ): Promise<AvailableSlot[]> {
    const service = await this.servicesRepository.findOne({
      where: { id: serviceId },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID ${serviceId} not found`);
    }

    // Define business hours (9 AM to 6 PM)
    const startOfDay = new Date(date);
    startOfDay.setHours(9, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(18, 0, 0, 0);

    // Get existing appointments for that day
    const existingAppointments = await this.appointmentsRepository.find({
      where: {
        tenant: { id: tenantId },
        scheduled_at: Between(startOfDay, endOfDay),
        status: AppointmentStatus.PENDING,
      },
      relations: ['service'],
    });

    // Generate time slots (every 30 minutes)
    const slots: AvailableSlot[] = [];
    let currentTime = new Date(startOfDay);

    while (currentTime < endOfDay) {
      const slotEnd = new Date(currentTime);
      slotEnd.setMinutes(slotEnd.getMinutes() + service.duration_minutes);

      if (slotEnd <= endOfDay) {
        const isAvailable = !existingAppointments.some((apt) => {
          const aptStart = new Date(apt.scheduled_at);
          const aptEnd = new Date(aptStart);
          aptEnd.setMinutes(aptEnd.getMinutes() + apt.service.duration_minutes);

          // Check if slots overlap
          return (
            (currentTime >= aptStart && currentTime < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (currentTime <= aptStart && slotEnd >= aptEnd)
          );
        });

        slots.push({
          start: new Date(currentTime),
          end: slotEnd,
          available: isAvailable,
        });
      }

      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }

    return slots.filter(slot => slot.available);
  }

  private async checkSlotAvailability(
    tenantId: string,
    scheduledAt: Date,
    durationMinutes: number,
    staffId?: string,
  ): Promise<boolean> {
    const slotEnd = new Date(scheduledAt);
    slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

    // Check our database for appointments
    const query = this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .leftJoinAndSelect('appointment.tenant', 'tenant')
      .leftJoinAndSelect('appointment.staff', 'staff')
      .where('tenant.id = :tenantId', { tenantId })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
      })
      .andWhere(
        `(appointment.scheduled_at < :slotEnd AND
          appointment.scheduled_at + (service.duration_minutes || ' minutes')::interval > :scheduledAt)`,
        { scheduledAt, slotEnd },
      );

    // If staffId is provided, only check that specific staff's availability
    if (staffId) {
      query.andWhere('staff.id = :staffId', { staffId });
    }

    const overlappingAppointments = await query.getCount();

    if (overlappingAppointments > 0) {
      return false;
    }

    // Also check Google Calendar if staff is assigned
    if (staffId) {
      try {
        const isAvailableInGoogleCalendar = await this.googleCalendarService.checkStaffAvailability(
          staffId,
          scheduledAt,
          slotEnd,
        );
        return isAvailableInGoogleCalendar;
      } catch (error) {
        console.error('Failed to check Google Calendar availability:', error);
        // On error, only rely on database check
        return true;
      }
    }

    return true;
  }

  async findByPhone(tenantId: string, phoneNumber: string): Promise<Appointment[]> {
    return this.appointmentsRepository.find({
      where: {
        tenant: { id: tenantId },
        customer_phone: phoneNumber,
        status: AppointmentStatus.PENDING,
      },
      relations: ['service', 'user'],
      order: {
        scheduled_at: 'ASC',
      },
    });
  }

  async findUpcoming(tenantId: string): Promise<Appointment[]> {
    const now = new Date();
    return this.appointmentsRepository.find({
      where: {
        tenant: { id: tenantId },
        scheduled_at: MoreThanOrEqual(now),
        status: AppointmentStatus.PENDING,
      },
      relations: ['service', 'user'],
      order: {
        scheduled_at: 'ASC',
      },
    });
  }

  async cancel(id: string, reason?: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id },
      relations: ['service', 'staff', 'tenant'],
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellation_reason = reason;

    const updatedAppointment = await this.appointmentsRepository.save(appointment);

    // Delete from Google Calendar
    if (updatedAppointment.google_event_id) {
      try {
        await this.googleCalendarService.deleteCalendarEvent(updatedAppointment);
      } catch (error) {
        console.error('Failed to delete event from Google Calendar:', error);
      }
    }

    return updatedAppointment;
  }

  async confirm(id: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id },
      relations: ['service', 'staff', 'tenant'],
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    appointment.status = AppointmentStatus.CONFIRMED;
    const confirmedAppointment = await this.appointmentsRepository.save(appointment);

    // Create/update Google Calendar event on confirmation
    if (confirmedAppointment.staff_id && !confirmedAppointment.google_event_id) {
      try {
        await this.googleCalendarService.createCalendarEvent(confirmedAppointment);
      } catch (error) {
        console.error('Failed to sync confirmed appointment to Google Calendar:', error);
      }
    }

    return confirmedAppointment;
  }

  async markNoShow(id: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    appointment.status = AppointmentStatus.NO_SHOW;
    return this.appointmentsRepository.save(appointment);
  }

  async markReminderSent(id: string): Promise<void> {
    await this.appointmentsRepository.update(id, {
      reminder_sent: true,
      reminder_sent_at: new Date(),
    });
  }
}
