import { IsString, IsEmail, IsOptional, IsEnum, IsObject } from 'class-validator';
import { TenantStatus } from '../entities';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsObject()
  config_json?: Record<string, any>;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsObject()
  config_json?: Record<string, any>;
}
