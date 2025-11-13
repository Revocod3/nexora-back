import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VoiceCallsController } from './voice-calls.controller';
import { VoiceCallsService } from './voice-calls.service';
import { ElevenLabsService } from './services/elevenlabs.service';
import { TwilioService } from './services/twilio.service';
import { ConversationService } from './services/conversation.service';
import { Call, User } from '../../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Call, User]),
    ConfigModule,
  ],
  controllers: [VoiceCallsController],
  providers: [
    VoiceCallsService,
    ElevenLabsService,
    TwilioService,
    ConversationService,
  ],
  exports: [VoiceCallsService],
})
export class VoiceCallsModule {}
