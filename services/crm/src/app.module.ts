import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ServicesModule } from './modules/services/services.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AdminJsModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { Tenant, User, Conversation, Message, Service, Appointment } from './entities';
import { RedisService } from './redis/redis.service.js';
import { MessagingService } from './messaging/messaging.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    DatabaseModule,
    TypeOrmModule.forFeature([Tenant, User, Conversation, Message, Service, Appointment]),
    UsersModule,
    TenantsModule,
    ServicesModule,
    AppointmentsModule,
    AdminJsModule,
  ],
  controllers: [HealthController],
  providers: [RedisService, MessagingService],
  exports: [RedisService],
})
export class AppModule { }
