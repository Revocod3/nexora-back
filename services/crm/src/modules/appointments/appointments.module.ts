import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { Appointment, Service, User, Tenant, Staff } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Service, User, Tenant, Staff])],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule { }
