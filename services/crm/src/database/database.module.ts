import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client, Lead, Contact, Conversation, Message, Consent, Service, Appointment } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'db'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'nexora_user'),
        password: configService.get<string>('DB_PASSWORD', 'changeme'),
        database: configService.get<string>('DB_NAME', 'nexora_db'),
        entities: [Client, Lead, Contact, Conversation, Message, Consent, Service, Appointment],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl: false, // SSL disabled for Docker local deployment
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule { }
