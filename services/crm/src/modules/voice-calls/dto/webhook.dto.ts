import { IsString, IsOptional } from 'class-validator';

/**
 * Twilio Webhook DTO
 * Only validates the fields we actually use, allows all other Twilio parameters
 */
export class TwilioWebhookDto {
  @IsString()
  @IsOptional()
  CallSid?: string;

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

  // Standard Twilio status callback parameters - all optional
  @IsString()
  @IsOptional()
  Called?: string;

  @IsString()
  @IsOptional()
  ToState?: string;

  @IsString()
  @IsOptional()
  CallerCountry?: string;

  @IsString()
  @IsOptional()
  Direction?: string;

  @IsString()
  @IsOptional()
  Timestamp?: string;

  @IsString()
  @IsOptional()
  CallbackSource?: string;

  @IsString()
  @IsOptional()
  SipResponseCode?: string;

  @IsString()
  @IsOptional()
  CallerState?: string;

  @IsString()
  @IsOptional()
  ToZip?: string;

  @IsString()
  @IsOptional()
  SequenceNumber?: string;

  @IsString()
  @IsOptional()
  CallerZip?: string;

  @IsString()
  @IsOptional()
  ToCountry?: string;

  @IsString()
  @IsOptional()
  CalledZip?: string;

  @IsString()
  @IsOptional()
  ApiVersion?: string;

  @IsString()
  @IsOptional()
  CalledCity?: string;

  @IsString()
  @IsOptional()
  Duration?: string;

  @IsString()
  @IsOptional()
  AccountSid?: string;

  @IsString()
  @IsOptional()
  CalledCountry?: string;

  @IsString()
  @IsOptional()
  CallerCity?: string;

  @IsString()
  @IsOptional()
  ToCity?: string;

  @IsString()
  @IsOptional()
  FromCountry?: string;

  @IsString()
  @IsOptional()
  Caller?: string;

  @IsString()
  @IsOptional()
  FromCity?: string;

  @IsString()
  @IsOptional()
  CalledState?: string;

  @IsString()
  @IsOptional()
  FromZip?: string;

  @IsString()
  @IsOptional()
  FromState?: string;
}
