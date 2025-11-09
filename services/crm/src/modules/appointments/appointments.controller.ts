import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, Service } from '../../entities';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
  ) { }

  @Get()
  @ApiOperation({ summary: 'Get all appointments for authenticated tenant' })
  @ApiResponse({ status: 200, description: 'Appointments list' })
  async getAppointments(@CurrentTenant() tenantId: string) {
    const tid = tenantId;

    const appointments = await this.appointmentsRepository.find({
      where: { tenant: { id: tid } },
      relations: ['service', 'user'],
      order: { scheduled_at: 'DESC' },
    });

    // Map to frontend expected format
    return appointments.map((apt) => ({
      id: apt.id,
      clientName: apt.customer_name || apt.user?.name || 'N/A',
      clientPhone: apt.customer_phone || apt.user?.phone_e164 || '',
      service: apt.service?.name || 'Unknown',
      datetime: apt.scheduled_at.toISOString(),
      status: apt.status,
      duration: apt.service?.duration_minutes || 0,
      price: apt.service ? Number(apt.service.price) : 0,
      notes: apt.notes || '',
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new appointment for authenticated tenant' })
  @ApiResponse({ status: 201, description: 'Appointment created successfully' })
  async createAppointment(@CurrentTenant() tenantId: string, @Body() dto: CreateAppointmentDto) {
    const appointment = await this.appointmentsService.create(tenantId, {
      serviceId: dto.serviceId,
      staffId: dto.staffId,
      scheduledAt: new Date(dto.datetime),
      customerName: dto.clientName,
      customerPhone: dto.clientPhone,
      notes: dto.notes,
      userId: dto.userId,
    });

    // Return in frontend format
    const service = await this.servicesRepository.findOne({ where: { id: dto.serviceId } });

    return {
      id: appointment.id,
      clientName: appointment.customer_name || '',
      clientPhone: appointment.customer_phone || '',
      service: service?.name || 'Unknown',
      datetime: appointment.scheduled_at.toISOString(),
      status: appointment.status,
      duration: service?.duration_minutes || dto.duration || 0,
      price: service ? Number(service.price) : dto.price || 0,
      notes: appointment.notes || '',
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment updated successfully' })
  async updateAppointment(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto
  ) {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: ['service', 'user'],
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    // Update fields
    if (dto.datetime) {
      appointment.scheduled_at = new Date(dto.datetime);
    }
    if (dto.clientName) {
      appointment.customer_name = dto.clientName;
    }
    if (dto.clientPhone) {
      appointment.customer_phone = dto.clientPhone;
    }
    if (dto.status) {
      appointment.status = dto.status;
    }
    if (dto.notes) {
      appointment.notes = dto.notes;
    }
    if (dto.cancellationReason) {
      appointment.cancellation_reason = dto.cancellationReason;
    }

    const updated = await this.appointmentsRepository.save(appointment);

    return {
      id: updated.id,
      clientName: updated.customer_name || updated.user?.name || '',
      clientPhone: updated.customer_phone || updated.user?.phone_e164 || '',
      service: updated.service?.name || 'Unknown',
      datetime: updated.scheduled_at.toISOString(),
      status: updated.status,
      duration: updated.service?.duration_minutes || 0,
      price: updated.service ? Number(updated.service.price) : 0,
      notes: updated.notes || '',
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment deleted successfully' })
  async deleteAppointment(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ) {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id, tenant: { id: tenantId } }
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    await this.appointmentsRepository.remove(appointment);

    return { message: 'Appointment deleted successfully', id };
  }
}
