import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarCredentials } from '../../entities/google-calendar-credentials.entity';
import { Appointment } from '../../entities/appointment.entity';
import { Staff } from '../../entities/staff.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GoogleCalendarCredentials,
      Appointment,
      Staff,
    ]),
  ],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
