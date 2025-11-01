import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Controller, Get, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, Lead, Contact, Conversation, Message, Consent } from '../entities';

@Controller('admin')
class AdminController {
  constructor(
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(Conversation) private conversationRepo: Repository<Conversation>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(Consent) private consentRepo: Repository<Consent>,
  ) {}

  @Get()
  async adminDashboard(@Res() res: Response) {
    const stats = {
      clients: await this.clientRepo.count(),
      leads: await this.leadRepo.count(),
      contacts: await this.contactRepo.count(),
      conversations: await this.conversationRepo.count(),
      messages: await this.messageRepo.count(),
      consents: await this.consentRepo.count(),
    };

    const recentLeads = await this.leadRepo.find({
      order: { created_at: 'DESC' },
      take: 10,
      relations: ['client'],
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
          .recent-leads { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
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
              <div class="stat-number">${stats.clients}</div>
              <div class="stat-label">Clients</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.leads}</div>
              <div class="stat-label">Leads</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.contacts}</div>
              <div class="stat-label">Contacts</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.conversations}</div>
              <div class="stat-label">Conversations</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.messages}</div>
              <div class="stat-label">Messages</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.consents}</div>
              <div class="stat-label">Consents</div>
            </div>
          </div>

          <div class="recent-leads">
            <h2>📋 Recent Leads</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Client</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                ${recentLeads
                  .map(
                    (lead) => `
                  <tr>
                    <td>${lead.name}</td>
                    <td>${lead.email || 'N/A'}</td>
                    <td><span class="status-${lead.status}">${lead.status}</span></td>
                    <td>${lead.client?.name || 'N/A'}</td>
                    <td>${new Date(lead.created_at).toLocaleDateString()}</td>
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
      clients: await this.clientRepo.count(),
      leads: await this.leadRepo.count(),
      contacts: await this.contactRepo.count(),
      conversations: await this.conversationRepo.count(),
      messages: await this.messageRepo.count(),
      consents: await this.consentRepo.count(),
      recent_leads: await this.leadRepo.find({
        order: { created_at: 'DESC' },
        take: 5,
        relations: ['client'],
      }),
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Client, Lead, Contact, Conversation, Message, Consent])],
  controllers: [AdminController],
})
export class AdminJsModule {}
