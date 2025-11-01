import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client, Lead, Contact, Conversation, Message, Consent } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST', 'db'),
        port: configService.get<number>('POSTGRES_PORT', 5432),
        username: configService.get<string>('POSTGRES_USER', 'realtec_user'),
        password: configService.get<string>('POSTGRES_PASSWORD', 'realtec_pass'),
        database: configService.get<string>('POSTGRES_DB', 'realtec_db'),
        entities: [Client, Lead, Contact, Conversation, Message, Consent],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl: configService.get<string>('NODE_ENV') === 'production',
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
