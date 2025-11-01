import { IsString, IsOptional, IsEnum, IsObject, IsUUID } from 'class-validator';
import { MessageDirection, MessageType } from '../entities';

export class CreateMessageDto {
  @IsUUID()
  conversation_id!: string;

  @IsEnum(MessageDirection)
  direction!: MessageDirection;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsString()
  content!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateMessageDto {
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
