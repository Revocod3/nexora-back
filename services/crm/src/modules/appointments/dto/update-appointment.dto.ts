import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { AppointmentStatus } from '../../../entities/appointment.entity';

export class UpdateAppointmentDto {
  @ApiProperty({ description: 'New scheduled date and time (ISO 8601)', required: false })
  @IsOptional()
  @IsDateString()
  datetime?: string;

  @ApiProperty({ description: 'Client name', required: false })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiProperty({ description: 'Client phone', required: false })
  @IsOptional()
  @IsString()
  clientPhone?: string;

  @ApiProperty({ description: 'Appointment status', required: false, enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Cancellation reason', required: false })
  @IsOptional()
  @IsString()
  cancellationReason?: string;

  @ApiProperty({ description: 'Staff member ID (for re-assignment)', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
