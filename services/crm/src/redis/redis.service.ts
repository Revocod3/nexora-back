import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private readonly redisUrl: string;

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || '6379';
    this.redisUrl = `redis://${host}:${port}`;
  }

  async onModuleInit() {
    try {
      // Main client
      this.client = createClient({ url: this.redisUrl }) as RedisClientType;

      this.client.on('error', (err: Error) => {
        this.logger.error(`Redis client error: ${err.message}`);
      });

      await this.client.connect();
      this.logger.log(`Redis initialized: ${this.redisUrl}`);

      // Subscriber client for pub/sub
      this.subscriber = createClient({ url: this.redisUrl }) as RedisClientType;
      await this.subscriber.connect();
      this.logger.log('Redis subscriber initialized');
    } catch (error) {
      this.logger.error(`Redis initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
        this.logger.log('Redis subscriber disconnected');
      } catch (error) {
        this.logger.error(`Redis subscriber disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('Redis disconnected');
      } catch (error) {
        this.logger.error(`Redis disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  async publish(topic: string, message: any): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    try {
      const stream = `bus:stream:${topic}`;
      const payload = JSON.stringify(message);
      
      await this.client.xAdd(stream, '*', {
        data: payload
      });
      
      this.logger.debug(`Published to stream ${stream}: ${payload.length} bytes`);
    } catch (error) {
      this.logger.error(`Publish failed for topic ${topic}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async subscribe(topic: string, handler: (message: any) => void | Promise<void>): Promise<void> {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    
    const stream = `bus:stream:${topic}`;
    const group = 'crm-consumer-group';
    const consumer = `crm-${process.pid}`;
    
    try {
      // Create consumer group if it doesn't exist
      try {
        await this.client!.xGroupCreate(stream, group, '0', {
          MKSTREAM: true
        });
        this.logger.log(`Created consumer group ${group} for stream ${stream}`);
      } catch (error: any) {
        if (!error.message?.includes('BUSYGROUP')) {
          throw error;
        }
        this.logger.debug(`Consumer group ${group} already exists for stream ${stream}`);
      }

      // Start consuming messages
      this.consumeStream(stream, group, consumer, handler);
      
      this.logger.log(`Subscribed to stream ${stream} with group ${group} as ${consumer}`);
    } catch (error) {
      this.logger.error(`Subscribe failed for topic ${topic}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async consumeStream(
    stream: string,
    group: string,
    consumer: string,
    handler: (message: any) => void | Promise<void>
  ): Promise<void> {
    const pollMessages = async () => {
      try {
        const results = await this.client!.xReadGroup(
          group,
          consumer,
          [
            {
              key: stream,
              id: '>' // Read only new messages
            }
          ],
          {
            COUNT: 10,
            BLOCK: 5000 // Block for 5 seconds
          }
        );

        if (results && results.length > 0) {
          for (const streamResult of results) {
            if (streamResult && streamResult.messages) {
              for (const message of streamResult.messages) {
                try {
                  const data = message.message.data;
                  const parsed = JSON.parse(data as string);
                  await handler(parsed);
                  
                  // Acknowledge the message
                  await this.client!.xAck(stream, group, message.id);
                } catch (error) {
                  this.logger.error(`Handler failed for message ${message.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }
            }
          }
        }
      } catch (error: any) {
        if (error.message?.includes('NOGROUP')) {
          this.logger.warn(`Consumer group missing for stream ${stream}`);
          return;
        }
        this.logger.error(`Stream consume error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Continue polling
      setImmediate(pollMessages);
    };

    // Start polling
    pollMessages();
  }
}
