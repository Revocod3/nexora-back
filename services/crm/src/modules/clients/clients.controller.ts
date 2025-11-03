import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Appointment, Service, AppointmentStatus } from '../../entities';

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
  ) { }

  @Get()
  @ApiOperation({ summary: 'Get all clients' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID (uses default if not provided)' })
  @ApiResponse({ status: 200, description: 'Clients list' })
  async getClients(@Query('tenantId') tenantId?: string) {
    const tid = tenantId || process.env.SINGLE_TENANT_ID || '00000000-0000-0000-0000-000000000000';

    // Get all users for this tenant
    const users = await this.usersRepository.find({
      where: { tenant: { id: tid } },
      order: { created_at: 'DESC' },
    });

    // Get their last appointments
    const clientsWithAppointments = await Promise.all(
      users.map(async (user) => {
        const lastAppointment = await this.appointmentsRepository.findOne({
          where: { user: { id: user.id } },
          order: { scheduled_at: 'DESC' },
        });

        return {
          id: user.id,
          name: user.name || 'N/A',
          phone: user.phone_e164 || '',
          lastVisit: lastAppointment?.scheduled_at.toISOString() || null,
        };
      }),
    );

    // Also include clients from appointments without user accounts
    const appointmentsWithoutUser = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.tenant', 'tenant')
      .where('tenant.id = :tid', { tid })
      .andWhere('appointment.user_id IS NULL')
      .andWhere('appointment.customer_phone IS NOT NULL')
      .orderBy('appointment.scheduled_at', 'DESC')
      .getMany();

    const guestClients = new Map();
    for (const apt of appointmentsWithoutUser) {
      if (apt.customer_phone && !guestClients.has(apt.customer_phone)) {
        guestClients.set(apt.customer_phone, {
          id: `guest-${apt.customer_phone}`,
          name: apt.customer_name || 'N/A',
          phone: apt.customer_phone,
          lastVisit: apt.scheduled_at.toISOString(),
        });
      }
    }

    return [...clientsWithAppointments, ...Array.from(guestClients.values())];
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get client analytics' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID (uses default if not provided)' })
  @ApiResponse({ status: 200, description: 'Client analytics' })
  async getAnalytics(@Query('tenantId') tenantId?: string) {
    const tid = tenantId || process.env.SINGLE_TENANT_ID || '00000000-0000-0000-0000-000000000000';

    // Total clients (users + unique guest phone numbers)
    const totalUsers = await this.usersRepository.count({
      where: { tenant: { id: tid } },
    });

    const guestAppointments = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoin('appointment.tenant', 'tenant')
      .select('COUNT(DISTINCT appointment.customer_phone)', 'count')
      .where('tenant.id = :tid', { tid })
      .andWhere('appointment.user_id IS NULL')
      .andWhere('appointment.customer_phone IS NOT NULL')
      .getRawOne();

    const totalClients = totalUsers + parseInt(guestAppointments?.count || '0', 10);

    // Average ticket (completed appointments)
    const completedAppointments = await this.appointmentsRepository.find({
      where: {
        tenant: { id: tid },
        status: AppointmentStatus.COMPLETED,
      },
      relations: ['service'],
    });

    const totalRevenue = completedAppointments.reduce(
      (sum, apt) => sum + (apt.service ? Number(apt.service.price) : 0),
      0,
    );

    const avgTicketEUR =
      completedAppointments.length > 0
        ? Math.round((totalRevenue / completedAppointments.length) * 100) / 100
        : 0;

    // Satisfaction (placeholder - would need actual rating system)
    const satisfaction = 4.5;

    // Top services
    const topServices = await this.appointmentsRepository
      .createQueryBuilder('appointment')
      .leftJoin('appointment.service', 'service')
      .leftJoin('appointment.tenant', 'tenant')
      .select('service.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('tenant.id = :tid', { tid })
      .groupBy('service.name')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    return {
      totalClients,
      avgTicketEUR,
      satisfaction,
      topServices: topServices.map((s) => ({
        name: s.name || 'Unknown',
        count: parseInt(s.count, 10),
      })),
    };
  }
}
