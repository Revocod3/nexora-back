import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VoiceCallsController } from './voice-calls.controller';
import { VoiceCallsService } from './voice-calls.service';
import { ElevenLabsService } from './services/elevenlabs.service';
import { TwilioService } from './services/twilio.service';
import { ConversationService } from './services/conversation.service';
import { Call, User } from '../../entities';
import { RedisService } from '../../redis/redis.service';
import { RealtimeSessionService } from './realtime-session.service';
import { OpenAIRealtimeService } from './openai-realtime.service';
import { TwilioMediaStreamGateway } from './twilio-media-stream.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Call, User]),
    ConfigModule,
  ],
  controllers: [VoiceCallsController],
  providers: [
    // Legacy services (Gather + OpenAI + ElevenLabs)
    VoiceCallsService,
    ElevenLabsService,
    TwilioService,
    ConversationService,
    // New realtime services (Media Streams + OpenAI Realtime API)
    RedisService,
    RealtimeSessionService,
    OpenAIRealtimeService,
    TwilioMediaStreamGateway,
  ],
  exports: [VoiceCallsService, RealtimeSessionService],
})
export class VoiceCallsModule {}
