import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import OpenAI from 'openai';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface InboundMessage {
  traceId: string;
  tenantId: string;
  timestamp: number;
  sender: string;
  content: {
    text: string;
  };
}

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);
  private openai: OpenAI;
  private readonly whatsappUrl: string;
  private readonly crmApiKey: string;

  constructor(
    private readonly redis: RedisService,
    private readonly httpService: HttpService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    this.openai = new OpenAI({ apiKey });
    this.whatsappUrl = process.env.WHATSAPP_CALLBACK_URL || 'http://whatsapp:3011/wa/send';
    this.crmApiKey = process.env.CRM_INTERNAL_API_KEY || '';
  }

  async onModuleInit() {
    // Wait a bit for Redis to fully initialize
    setTimeout(async () => {
      try {
        // Subscribe to inbound messages from WhatsApp
        await this.redis.subscribe('whatsapp:inbound:messages', async (message: InboundMessage) => {
          await this.handleInboundMessage(message);
        });
        this.logger.log('MessagingService initialized and listening for WhatsApp messages');
      } catch (error) {
        this.logger.error(`Failed to subscribe to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, 2000);
  }

  private async handleInboundMessage(message: InboundMessage) {
    try {
      this.logger.log(`Processing message from ${message.sender}: ${message.content.text}`);

      // Generate AI response
      const response = await this.generateAIResponse(message.content.text);

      this.logger.log(`AI generated response: ${response}`);

      // Send response back through WhatsApp
      await this.sendWhatsAppMessage(message.sender, response);

      this.logger.log(`Response sent successfully to ${message.sender}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle inbound message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async generateAIResponse(userMessage: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente de ventas amable y profesional. Responde de manera concisa y útil en español.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return completion.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
    } catch (error) {
      this.logger.error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 'Lo siento, estoy experimentando dificultades técnicas. ¿Puedes intentarlo de nuevo?';
    }
  }

  private async sendWhatsAppMessage(to: string, text: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.whatsappUrl,
          { to, text },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-internal-key': this.crmApiKey,
            },
          },
        ),
      );

      if (!response.data?.ok) {
        throw new Error(`WhatsApp send failed: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}
