import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { Appointment, Service, User, Tenant } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Service, User, Tenant])],
  controllers: [DashboardController],
})
export class DashboardModule { }
