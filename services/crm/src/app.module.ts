import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { LeadsModule } from './modules/leads/leads.module';
import { ClientsModule } from './modules/clients/clients.module';
import { AdminJsModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { Client, Lead, Contact, Conversation, Message, Consent } from './entities';
import { RedisService } from './redis/redis.service.js';
import { MessagingService } from './messaging/messaging.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    DatabaseModule,
    TypeOrmModule.forFeature([Client, Lead, Contact, Conversation, Message, Consent]),
    LeadsModule,
    ClientsModule,
    AdminJsModule,
  ],
  controllers: [HealthController],
  providers: [RedisService, MessagingService],
})
export class AppModule { }
