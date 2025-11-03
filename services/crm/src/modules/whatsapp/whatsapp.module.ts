import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [HttpModule],
  controllers: [WhatsAppController],
})
export class WhatsAppModule {}
