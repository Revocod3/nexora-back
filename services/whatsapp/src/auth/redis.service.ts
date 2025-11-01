import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { createLogger } from '@nexora/logger';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  connectTimeout: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  maxRetriesPerRequestRetries: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger({ service: 'connector-whatsapp-redis' });
  private client: Redis;
  private readonly config: RedisConfig;

  constructor() {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_PREFIX || 'wa:',
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequestRetries: 3,
    };

    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      connectTimeout: this.config.connectTimeout,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      enableReadyCheck: this.config.enableReadyCheck,
      lazyConnect: true, // Connect on first command
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.log.info('redis.connected', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
      });
    } catch (error) {
      this.log.error('redis.connection.failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        host: this.config.host,
        port: this.config.port,
      });
      throw error;
    }

    // Setup event handlers
    this.client.on('error', (error) => {
      this.log.error('redis.error', {
        error: error.message,
      });
    });

    this.client.on('connect', () => {
      this.log.info('redis.connect');
    });

    this.client.on('ready', () => {
      this.log.info('redis.ready');
    });

    this.client.on('close', () => {
      this.log.warn('redis.close');
    });
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
      this.log.info('redis.disconnected');
    } catch (error) {
      this.log.error('redis.disconnect.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  getClient(): Redis {
    return this.client;
  }

  getConfig(): RedisConfig {
    return { ...this.config };
  }

  // Health check method
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.log.error('redis.ping.failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  // Utility method to generate prefixed keys
  getKey(...parts: string[]): string {
    return parts.join(':');
  }
}
