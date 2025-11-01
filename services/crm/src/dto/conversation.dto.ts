import { IsString, IsOptional, IsEnum, IsObject, IsUUID } from 'class-validator';
import { ConversationStatus, MessageDirection, MessageType } from '../entities';

export class CreateConversationDto {
  @IsUUID()
  lead_id!: string;

  @IsString()
  channel!: string;

  @IsOptional()
  @IsString()
  channel_id?: string;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  channel_id?: string;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
