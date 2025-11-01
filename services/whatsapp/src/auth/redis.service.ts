import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createLogger } from '../utils/logger.js';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger('connector-whatsapp-redis');
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
      this.client = createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              this.log.error('redis.connection.max_retries_exceeded');
              return new Error('Max retries exceeded');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      }) as RedisClientType;

      this.client.on('error', (err: Error) => {
        this.log.error('redis.client.error', { error: err.message });
      });

      this.client.on('connect', () => {
        this.log.info('redis.client.connecting', { url: this.redisUrl });
      });

      this.client.on('ready', () => {
        this.log.info('redis.client.ready', { url: this.redisUrl });
      });

      this.client.on('reconnecting', () => {
        this.log.warn('redis.client.reconnecting', { url: this.redisUrl });
      });

      await this.client.connect();
      this.log.info('redis.initialized', { url: this.redisUrl });

      // Create separate subscriber client for pub/sub
      this.subscriber = createClient({ url: this.redisUrl }) as RedisClientType;
      await this.subscriber.connect();
      this.log.info('redis.subscriber.initialized');
    } catch (error) {
      this.log.error('redis.initialization.failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: this.redisUrl,
      });
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
        this.log.info('redis.subscriber.disconnected');
      } catch (error) {
        this.log.error('redis.subscriber.disconnect.failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    if (this.client) {
      try {
        await this.client.quit();
        this.log.info('redis.disconnected');
      } catch (error) {
        this.log.error('redis.disconnect.failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  getKey(...parts: string[]): string {
    return parts.join(':');
  }

  /**
   * Publish a message to a Redis Stream
   */
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

      this.log.debug('redis.stream.publish.success', { topic, stream, size: payload.length });
    } catch (error) {
      this.log.error('redis.stream.publish.failed', {
        topic,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Subscribe to a Redis Stream (consumer group pattern)
   */
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
        this.log.info('redis.stream.group.created', { stream, group });
      } catch (error: any) {
        if (!error.message?.includes('BUSYGROUP')) {
          throw error;
        }
        this.log.debug('redis.stream.group.exists', { stream, group });
      }

      // Start consuming messages
      this.consumeStream(stream, group, consumer, handler);

      this.log.info('redis.stream.subscribe.success', { topic, stream, group, consumer });
    } catch (error) {
      this.log.error('redis.stream.subscribe.failed', {
        topic,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
                  this.log.error('redis.stream.handler.failed', {
                    stream,
                    messageId: message.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              }
            }
          }
        }
      } catch (error: any) {
        if (error.message?.includes('NOGROUP')) {
          this.log.warn('redis.stream.group.missing', { stream, group });
          return;
        }
        this.log.error('redis.stream.consume.error', {
          stream,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Continue polling
      setImmediate(pollMessages);
    };

    // Start polling
    pollMessages();
  }
}
