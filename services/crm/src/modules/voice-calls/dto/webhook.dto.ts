import { IsString, IsOptional, IsEnum } from 'class-validator';

export class TwilioWebhookDto {
  @IsString()
  CallSid!: string;

  @IsString()
  @IsOptional()
  CallStatus?: string;

  @IsString()
  @IsOptional()
  From?: string;

  @IsString()
  @IsOptional()
  To?: string;

  @IsString()
  @IsOptional()
  CallDuration?: string;

  @IsString()
  @IsOptional()
  RecordingUrl?: string;

  @IsString()
  @IsOptional()
  Digits?: string;

  @IsString()
  @IsOptional()
  SpeechResult?: string;
}
