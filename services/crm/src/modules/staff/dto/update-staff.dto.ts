import { PartialType } from '@nestjs/mapped-types';
import { CreateStaffDto } from './create-staff.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
