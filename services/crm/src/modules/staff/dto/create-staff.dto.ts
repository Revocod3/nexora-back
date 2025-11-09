import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';
import { StaffRole } from '../../../entities';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(StaffRole)
  @IsOptional()
  role?: StaffRole;

  @IsObject()
  @IsOptional()
  availability?: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
