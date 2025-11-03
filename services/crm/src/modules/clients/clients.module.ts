import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsController } from './clients.controller';
import { User, Appointment, Service, Tenant } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([User, Appointment, Service, Tenant])],
  controllers: [ClientsController],
})
export class ClientsModule { }
