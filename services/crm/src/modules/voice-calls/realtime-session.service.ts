import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

/**
 * Session state for a voice call using OpenAI Realtime API
 */
export interface RealtimeSession {
  callSid: string;
  streamSid: string;
  tenantId: string;
  phoneNumber: string;
  conversationId?: string;
  createdAt: number;
  updatedAt: number;
  status: 'connecting' | 'active' | 'completed' | 'failed';
  openAiSessionId?: string;
  transcript: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  metadata?: Record<string, any>;
}

@Injectable()
export class RealtimeSessionService {
  private readonly logger = new Logger(RealtimeSessionService.name);
  private readonly SESSION_TTL = 3600; // 1 hour
  private readonly SESSION_PREFIX = 'realtime:session:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Creates a new session
   */
  async createSession(data: {
    callSid: string;
    streamSid: string;
    tenantId: string;
    phoneNumber: string;
    conversationId?: string;
  }): Promise<RealtimeSession> {
    const session: RealtimeSession = {
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'connecting',
      transcript: [],
    };

    await this.saveSession(session);
    this.logger.log(`Created session for call ${data.callSid}`);

    return session;
  }

  /**
   * Gets a session by call SID
   */
  async getSession(callSid: string): Promise<RealtimeSession | null> {
    const key = this.getKey(callSid);
    const client = this.redisService.getClient();

    try {
      const data = await client.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as RealtimeSession;
    } catch (error) {
      this.logger.error(
        `Failed to get session ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Gets a session by stream SID
   */
  async getSessionByStreamSid(streamSid: string): Promise<RealtimeSession | null> {
    const client = this.redisService.getClient();

    try {
      // Search for session with this streamSid
      const keys = await client.keys(`${this.SESSION_PREFIX}*`);

      for (const key of keys) {
        const data = await client.get(key);
        if (data) {
          const session = JSON.parse(data) as RealtimeSession;
          if (session.streamSid === streamSid) {
            return session;
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to get session by streamSid ${streamSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Updates a session
   */
  async updateSession(
    callSid: string,
    updates: Partial<RealtimeSession>,
  ): Promise<void> {
    const session = await this.getSession(callSid);
    if (!session) {
      throw new Error(`Session not found for call ${callSid}`);
    }

    const updatedSession: RealtimeSession = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveSession(updatedSession);
    this.logger.debug(`Updated session for call ${callSid}`);
  }

  /**
   * Adds a message to the transcript
   */
  async addTranscript(
    callSid: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const session = await this.getSession(callSid);
    if (!session) {
      this.logger.warn(`Session not found for transcript: ${callSid}`);
      return;
    }

    session.transcript.push({
      role,
      content,
      timestamp: Date.now(),
    });

    session.updatedAt = Date.now();

    await this.saveSession(session);
    this.logger.debug(
      `Added ${role} transcript to call ${callSid}: ${content.substring(0, 50)}...`,
    );
  }

  /**
   * Deletes a session
   */
  async deleteSession(callSid: string): Promise<void> {
    const key = this.getKey(callSid);
    const client = this.redisService.getClient();

    try {
      await client.del(key);
      this.logger.log(`Deleted session for call ${callSid}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete session ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets all active sessions (for monitoring/debugging)
   */
  async getAllSessions(): Promise<RealtimeSession[]> {
    const client = this.redisService.getClient();

    try {
      const keys = await client.keys(`${this.SESSION_PREFIX}*`);
      const sessions: RealtimeSession[] = [];

      for (const key of keys) {
        const data = await client.get(key);
        if (data) {
          sessions.push(JSON.parse(data) as RealtimeSession);
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error(
        `Failed to get all sessions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /**
   * Saves a session to Redis
   */
  private async saveSession(session: RealtimeSession): Promise<void> {
    const key = this.getKey(session.callSid);
    const client = this.redisService.getClient();

    try {
      await client.setEx(key, this.SESSION_TTL, JSON.stringify(session));
    } catch (error) {
      this.logger.error(
        `Failed to save session ${session.callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Gets the Redis key for a call SID
   */
  private getKey(callSid: string): string {
    return `${this.SESSION_PREFIX}${callSid}`;
  }
}
