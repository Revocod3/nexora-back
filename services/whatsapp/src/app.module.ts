import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { WAController } from './controllers/wa.controller.js';
import { WhatsappService } from './services/whatsapp.service.js';
import { WhatsappConfigService } from './config/config.js';
import { OutboundConsumer } from './consumers/outbound.consumer.js';
import { HealthController } from './controllers/health.controller.js';
import { HealthController as NewHealthController } from './health/health.controller.js';
import { RedisService } from './auth/redis.service.js';
import { SessionLockManager } from './locks/session-lock-manager.js';
import { WhatsAppSessionManager } from './sessions/session-manager.js';
import { SessionHealthService } from './health/session-health.js';

@Module({
  controllers: [HealthController, WAController, NewHealthController],
  providers: [
    WhatsappConfigService,
    WhatsappService,
    OutboundConsumer,
    RedisService,
    SessionLockManager,
    WhatsAppSessionManager,
    SessionHealthService,
  ],
})
export class AppModule {}
