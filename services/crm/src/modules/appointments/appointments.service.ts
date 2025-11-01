import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { Appointment, Lead, Service, Client, AppointmentStatus } from '../../entities';

export interface CreateAppointmentDto {
  leadId?: string;
  serviceId: string;
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
    @InjectRepository(Lead)
    private leadsRepository: Repository<Lead>,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
  ) {}

  async create(clientId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    const client = await this.clientsRepository.findOne({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    const service = await this.servicesRepository.findOne({
      where: { id: dto.serviceId },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID ${dto.serviceId} not found`);
    }

    let lead: Lead | undefined;
    if (dto.leadId) {
      const foundLead = await this.leadsRepository.findOne({
        where: { id: dto.leadId },
      });
      if (!foundLead) {
        throw new NotFoundException(`Lead with ID ${dto.leadId} not found`);
      }
      lead = foundLead;
    }

    // Check availability
    const isAvailable = await this.checkSlotAvailability(
      clientId,
      dto.scheduledAt,
      service.duration_minutes,
    );

    if (!isAvailable) {
      throw new BadRequestException('The selected time slot is not available');
    }

    const appointment = this.appointmentsRepository.create({
      client,
      lead,
      service,
      scheduled_at: dto.scheduledAt,
      customer_name: dto.customerName || lead?.name,
      customer_phone: dto.customerPhone || lead?.phone_e164,
      notes: dto.notes,
      status: AppointmentStatus.PENDING,
    });

    return this.appointmentsRepository.save(appointment);
  }

  async findAvailableSlots(
    clientId: string,
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
        client: { id: clientId },
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
    clientId: string,
    scheduledAt: Date,
    durationMinutes: number,
  ): Promise<boolean> {
    const slotEnd = new Date(scheduledAt);
    slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

    const overlappingAppointments = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .leftJoinAndSelect('appointment.client', 'client')
      .where('client.id = :clientId', { clientId })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
      })
      .andWhere(
        `(appointment.scheduled_at < :slotEnd AND
          appointment.scheduled_at + (service.duration_minutes || ' minutes')::interval > :scheduledAt)`,
        { scheduledAt, slotEnd },
      )
      .getCount();

    return overlappingAppointments === 0;
  }

  async findByPhone(clientId: string, phoneNumber: string): Promise<Appointment[]> {
    return this.appointmentsRepository.find({
      where: {
        client: { id: clientId },
        customer_phone: phoneNumber,
        status: AppointmentStatus.PENDING,
      },
      relations: ['service', 'lead'],
      order: {
        scheduled_at: 'ASC',
      },
    });
  }

  async findUpcoming(clientId: string): Promise<Appointment[]> {
    const now = new Date();
    return this.appointmentsRepository.find({
      where: {
        client: { id: clientId },
        scheduled_at: MoreThanOrEqual(now),
        status: AppointmentStatus.PENDING,
      },
      relations: ['service', 'lead'],
      order: {
        scheduled_at: 'ASC',
      },
    });
  }

  async cancel(id: string, reason?: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellation_reason = reason;

    return this.appointmentsRepository.save(appointment);
  }

  async confirm(id: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    appointment.status = AppointmentStatus.CONFIRMED;
    return this.appointmentsRepository.save(appointment);
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
