import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { Agent, run, setDefaultOpenAIKey } from '@openai/agents';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ServicesService } from '../modules/services/services.service';
import { AppointmentsService } from '../modules/appointments/appointments.service';
import { ClientsService } from '../modules/clients/clients.service';
import { createSalonTools } from '../agents/tools/salon.tools';
import { SALON_AGENT_INSTRUCTIONS } from '../agents/definitions/salon-assistant.agent';

interface InboundMessage {
  traceId: string;
  tenantId: string;
  timestamp: number;
  sender: string;
  content: {
    text: string;
  };
}

interface ConversationHistory {
  items: any[];
  lastUpdated: number;
}

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);
  private readonly agent: Agent;
  private readonly whatsappUrl: string;
  private readonly crmApiKey: string;
  private readonly tools: ReturnType<typeof createSalonTools>;

  constructor(
    private readonly redis: RedisService,
    private readonly httpService: HttpService,
    private readonly servicesService: ServicesService,
    private readonly appointmentsService: AppointmentsService,
    private readonly clientsService: ClientsService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    // Set the global OpenAI API key for the agents SDK
    setDefaultOpenAIKey(apiKey);

    // Create tools with service dependencies
    this.tools = createSalonTools(this.servicesService, this.appointmentsService);

    // Create the salon assistant agent
    this.agent = new Agent({
      name: 'SalonAssistant',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      instructions: SALON_AGENT_INSTRUCTIONS,
      tools: [
        this.tools.get_services,
        this.tools.check_availability,
        this.tools.create_appointment,
        this.tools.find_appointments,
        this.tools.cancel_appointment,
      ],
    });

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

      // Get conversation history from Redis
      const historyKey = `conversation:${message.sender}`;
      const redisClient = this.redis.getClient();
      const savedHistory = await redisClient.get(historyKey);
      let history: any[] = [];

      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          history = parsed.items || [];
        } catch (e) {
          this.logger.warn('Failed to parse history, starting fresh');
        }
      }

      // Run agent with history
      const input = history.length > 0
        ? history.concat({ role: 'user', content: message.content.text })
        : message.content.text;

      // Get salon name from client config
      let salonName = 'Salón de Belleza';
      try {
        const client = await this.clientsService.findOne(message.tenantId);
        salonName = client.name || salonName;
      } catch (e) {
        this.logger.warn(`Could not fetch client name for ${message.tenantId}`);
      }

      const result = await run(this.agent, input, {
        context: {
          salonName,
          clientId: message.tenantId,
          customerPhone: message.sender,
        },
      });

      // Save updated history (expire after 1 hour)
      await redisClient.setEx(
        historyKey,
        3600,
        JSON.stringify({ items: result.history, lastUpdated: Date.now() })
      );

      const response = result.finalOutput || 'Lo siento, no pude generar una respuesta.';
      await this.sendWhatsAppMessage(message.sender, response);

      this.logger.log(`Response sent successfully to ${message.sender}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle inbound message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.sendWhatsAppMessage(
        message.sender,
        'Disculpa, tuve un problema técnico. ¿Puedes repetir tu solicitud?',
      ).catch(err => this.logger.error('Failed to send fallback message', err));
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
