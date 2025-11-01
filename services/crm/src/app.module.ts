import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsModule } from './modules/leads/leads.module';
import { ClientsModule } from './modules/clients/clients.module';
import { AdminJsModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { Client, Lead, Contact, Conversation, Message, Consent } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([Client, Lead, Contact, Conversation, Message, Consent]),
    LeadsModule,
    ClientsModule,
    AdminJsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
