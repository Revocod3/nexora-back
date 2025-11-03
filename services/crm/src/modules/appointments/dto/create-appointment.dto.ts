import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, IsUUID, IsNumber } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'Service ID' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ description: 'Scheduled date and time (ISO 8601)' })
  @IsDateString()
  datetime!: string;

  @ApiProperty({ description: 'Client name', required: false })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiProperty({ description: 'Client phone', required: false })
  @IsOptional()
  @IsString()
  clientPhone?: string;

  @ApiProperty({ description: 'Duration in minutes', required: false })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiProperty({ description: 'Price', required: false })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'User ID (if linked to registered user)', required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ description: 'Tenant ID', required: false })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
