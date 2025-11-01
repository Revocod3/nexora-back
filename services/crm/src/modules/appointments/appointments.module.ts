import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment, Service, Lead, Client } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Service, Lead, Client])],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
