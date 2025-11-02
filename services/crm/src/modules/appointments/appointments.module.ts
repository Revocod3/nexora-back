import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment, Service, User, Tenant } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Service, User, Tenant])],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
