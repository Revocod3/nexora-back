import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, User, Conversation, Message, Service, Appointment } from '../entities';

@Controller('admin')
class AdminController {
  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Conversation) private conversationRepo: Repository<Conversation>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(Service) private serviceRepo: Repository<Service>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
  ) {}

  @Get()
  async adminDashboard(@Res() res: Response) {
    const stats = {
      tenants: await this.tenantRepo.count(),
      users: await this.userRepo.count(),
      conversations: await this.conversationRepo.count(),
      messages: await this.messageRepo.count(),
      services: await this.serviceRepo.count(),
      appointments: await this.appointmentRepo.count(),
    };

    const recentUsers = await this.userRepo.find({
      order: { created_at: 'DESC' },
      take: 10,
      relations: ['tenant'],
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Realtec CRM Admin</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; }
          .header { background: #667eea; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
          .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .stat-number { font-size: 2em; font-weight: bold; color: #667eea; }
          .stat-label { color: #666; }
          .recent-users { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
          th { background: #f8f9fa; }
          .status-new { color: #28a745; font-weight: bold; }
          .status-contacted { color: #ffc107; font-weight: bold; }
          .status-qualified { color: #007bff; font-weight: bold; }
          .note { background: #e9ecef; padding: 15px; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Realtec CRM Admin Dashboard</h1>
            <p>Simple admin interface for CRM data overview</p>
          </div>
          
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${stats.tenants}</div>
              <div class="stat-label">Clients</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.users}</div>
              <div class="stat-label">Leads</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.services}</div>
              <div class="stat-label">Services</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.appointments}</div>
              <div class="stat-label">Appointments</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.conversations}</div>
              <div class="stat-label">Conversations</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.messages}</div>
              <div class="stat-label">Messages</div>
            </div>
          </div>

          <div class="recent-users">
            <h2>📋 Recent Leads</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Tenant</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                ${recentUsers
                  .map(
                    (user) => `
                  <tr>
                    <td>${user.name}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td><span class="status-${user.status}">${user.status}</span></td>
                    <td>${user.tenant?.name || 'N/A'}</td>
                    <td>${new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="note">
            <strong>📝 Note:</strong> This is a basic admin interface. Full AdminJS integration is planned for future versions with advanced CRUD operations, filtering, and authentication.
          </div>
        </div>
      </body>
      </html>
    `);
  }

  @Get('api/stats')
  async getStats() {
    return {
      tenants: await this.tenantRepo.count(),
      users: await this.userRepo.count(),
      services: await this.serviceRepo.count(),
      appointments: await this.appointmentRepo.count(),
      conversations: await this.conversationRepo.count(),
      messages: await this.messageRepo.count(),
      recent_leads: await this.userRepo.find({
        order: { created_at: 'DESC' },
        take: 5,
        relations: ['tenant'],
      }),
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User, Conversation, Message, Service, Appointment])],
  controllers: [AdminController],
})
export class AdminJsModule {}
