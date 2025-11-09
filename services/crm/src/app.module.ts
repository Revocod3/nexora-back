import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ServicesModule } from './modules/services/services.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ClientsModule } from './modules/clients/clients.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { AdminJsModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { Tenant, TenantUser, Staff, User, Conversation, Message, Service, Appointment } from './entities';
import { RedisService } from './redis/redis.service.js';
import { MessagingService } from './messaging/messaging.service.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests per minute
    }]),
    HttpModule,
    DatabaseModule,
    TypeOrmModule.forFeature([Tenant, TenantUser, Staff, User, Conversation, Message, Service, Appointment]),
    AuthModule,
    StaffModule,
    UsersModule,
    TenantsModule,
    ServicesModule,
    AppointmentsModule,
    DashboardModule,
    ClientsModule,
    WhatsAppModule,
    AdminJsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    RedisService,
    MessagingService,
  ],
  exports: [RedisService],
})
export class AppModule { }
