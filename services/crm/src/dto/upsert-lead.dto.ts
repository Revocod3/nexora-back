import {
  IsString,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { LeadStatus } from '../entities';

export class UpsertLeadDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone_e164?: string;

  @IsOptional()
  @IsString()
  utm_source?: string;

  @IsOptional()
  @IsString()
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  consent_text?: string;

  @IsOptional()
  @IsString()
  consent_ip?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualification_score?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
