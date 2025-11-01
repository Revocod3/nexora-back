import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@nexora/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

// Simplified storage service using filesystem instead of Redis
// This is perfect for MVP - no external dependencies needed
@Injectable()
export class RedisService implements OnModuleInit {
  private readonly log = createLogger('connector-whatsapp-storage');
  private readonly storageDir: string;

  constructor() {
    this.storageDir = path.join(process.cwd(), 'auth_info');
  }

  async onModuleInit() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      this.log.info(`Storage initialized at ${this.storageDir}`);
    } catch (error) {
      this.log.error(`Storage initialization failed: ${error}`);
      throw error;
    }
  }

  getClient(): any {
    // Return a Redis-like interface
    return {
      get: async (key: string) => {
        try {
          const filePath = this.getFilePath(key);
          const data = await fs.readFile(filePath, 'utf8');
          return data;
        } catch (error) {
          return null;
        }
      },
      set: async (key: string, value: string) => {
        const filePath = this.getFilePath(key);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, value, 'utf8');
        return 'OK';
      },
      del: async (...keys: string[]) => {
        let count = 0;
        for (const key of keys) {
          try {
            await fs.unlink(this.getFilePath(key));
            count++;
          } catch (error) {
            // File doesn't exist, that's OK
          }
        }
        return count;
      },
      exists: async (...keys: string[]) => {
        let count = 0;
        for (const key of keys) {
          try {
            await fs.access(this.getFilePath(key));
            count++;
          } catch (error) {
            // File doesn't exist
          }
        }
        return count;
      },
    };
  }

  async ping(): Promise<boolean> {
    try {
      await fs.access(this.storageDir);
      return true;
    } catch (error) {
      return false;
    }
  }

  getKey(...parts: string[]): string {
    return parts.join(':');
  }

  private getFilePath(key: string): string {
    // Convert Redis key to safe filesystem path
    const safeName = key.replace(/:/g, '_');
    return path.join(this.storageDir, `${safeName}.json`);
  }
}
