import { IsString, IsPhoneNumber, IsOptional, IsUUID, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCallDto {
  @ApiProperty({ description: 'User ID to call (optional)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ description: 'Phone number to call in E.164 format', example: '+34612345678' })
  @IsPhoneNumber()
  toNumber!: string;

  @ApiProperty({ description: 'Name of the person to call', example: 'María García' })
  @IsString()
  contactName!: string;

  @ApiProperty({ description: 'Business name for context', example: 'Salón Elegante' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiProperty({ description: 'Additional context for the call', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
