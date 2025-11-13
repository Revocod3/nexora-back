import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
import { Appointment, Service, User, AppointmentStatus } from '../../entities';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    @InjectRepository(Service)
    private servicesRepository: Repository<Service>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics for authenticated tenant' })
  @ApiResponse({ status: 200, description: 'Dashboard stats' })
  async getStats(@CurrentTenant() tenantId: string) {
    const tid = tenantId;

    // Appointments today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointmentsToday = await this.appointmentsRepository.count({
      where: {
        tenant: { id: tid },
        scheduled_at: Between(today, tomorrow),
        status: AppointmentStatus.CONFIRMED,
      },
    });

    // Revenue last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const completedAppointments = await this.appointmentsRepository.find({
      where: {
        tenant: { id: tid },
        status: AppointmentStatus.COMPLETED,
        completed_at: MoreThanOrEqual(sevenDaysAgo),
      },
      relations: ['service'],
    });

    const revenue7d = completedAppointments.reduce(
      (sum, apt) => sum + (apt.service ? Number(apt.service.price) : 0),
      0,
    );

    // Popular services (top 5 by appointment count)
    const servicesWithCount = await this.appointmentsRepository
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

    const popularServices = servicesWithCount.map((s) => ({
      name: s.name || 'Unknown',
      count: parseInt(s.count, 10),
    }));

    // Recent clients (last 10 unique)
    const recentAppointments = await this.appointmentsRepository.find({
      where: { tenant: { id: tid } },
      relations: ['user'],
      order: { scheduled_at: 'DESC' },
      take: 20,
    });

    const uniqueClients = new Map();
    for (const apt of recentAppointments) {
      const clientId = apt.user?.id || apt.customer_phone || apt.customer_name;
      if (clientId && !uniqueClients.has(clientId)) {
        uniqueClients.set(clientId, {
          id: apt.user?.id || clientId,
          name: apt.customer_name || apt.user?.name || 'N/A',
          phone: apt.customer_phone || apt.user?.phone_e164 || '',
          lastVisit: apt.scheduled_at.toISOString(),
        });
        if (uniqueClients.size >= 10) break;
      }
    }

    const recentClients = Array.from(uniqueClients.values());

    return {
      appointmentsToday,
      revenue7d: Math.round(revenue7d * 100) / 100,
      popularServices,
      recentClients,
    };
  }

  @Get('appointments/today')
  @ApiOperation({ summary: 'Get today\'s appointments for authenticated tenant' })
  @ApiResponse({ status: 200, description: 'Today\'s appointments' })
  async getTodayAppointments(@CurrentTenant() tenantId: string) {
    const tid = tenantId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await this.appointmentsRepository.find({
      where: {
        tenant: { id: tid },
        scheduled_at: Between(today, tomorrow),
      },
      relations: ['service', 'user'],
      order: { scheduled_at: 'ASC' },
    });

    return appointments.map((apt) => ({
      id: apt.id,
      client: apt.customer_name || apt.user?.name || 'N/A',
      service: apt.service?.name || 'Unknown',
      startsAt: apt.scheduled_at.toISOString(),
      status: apt.status,
    }));
  }
}
