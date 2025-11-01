import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EnvelopeSchema } from '@nexora/contracts';
import { WhatsappConfigService } from '../config/config.js';
import { useRedisAuthState } from '../auth/redis-auth-state.js';
import { SessionLockManager } from '../locks/session-lock-manager.js';
import { createLogger } from '@nexora/logger';
import crypto from 'node:crypto';
import { logJidTransformation, debugBaileysMessage, compareJidsForThreadConsistency } from '../utils/jid-debug.js';

// Baileys types (minimal interface to avoid direct imports)
type WAMessage = {
  key: { id?: string; fromMe?: boolean; remoteJid?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: { url?: string; mimetype?: string; seconds?: number };
  };
};

type WASocket = {
  ev: {
    on: (ev: string, cb: (data: unknown) => void) => void;
    off: (ev: string, cb: (data: unknown) => void) => void;
  };
  sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
  logout: () => Promise<void>;
  store?: { contacts?: Record<string, any> };
};

enum LocalDisconnectReason {
  loggedOut = 401,
}

interface MessagesUpsertEvent {
  messages: WAMessage[];
}

interface ConnectionUpdateEvent {
  connection?: string;
  lastDisconnect?: { error?: { output?: { statusCode?: number }; statusCode?: number } };
  qr?: string;
}

export interface TenantSessionService {
  tenantId: string;
  isConnected(): boolean;
  getConnectionState(): string;
  getLastQr(): string | null;
  sendMessage(to: string, message: any): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
}

@Injectable()
export class TenantSessionServiceImpl implements TenantSessionService, OnModuleDestroy {
  public readonly tenantId: string;
  private readonly log = createLogger('connector-whatsapp-tenant-session');
  private sock: WASocket | null = null;
  private lastQr: string | null = null;
  private connection: string = 'disconnected';
  private authState: any = null;
  private saveCreds: (() => Promise<void>) | null = null;
  private clearAuthState: (() => Promise<void>) | null = null;
  private lockManager: SessionLockManager;
  private workerId: string;
  private lockRenewalInterval?: NodeJS.Timeout;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = parseInt(process.env.WA_MAX_RECONNECT_ATTEMPTS || '5');
  private baseReconnectDelay = parseInt(process.env.WA_BASE_RECONNECT_DELAY_MS || '5000');
  private connectionStableTimeout?: NodeJS.Timeout;
  private connectionStabilityDelay = parseInt(process.env.WA_CONNECTION_STABILITY_DELAY_MS || '30000');
  private messageQueueTimeout = parseInt(process.env.WA_MESSAGE_QUEUE_TIMEOUT_MS || '60000');
  private lastSuccessfulConnection = 0;
  private pendingMessages: Array<{ to: string; message: any; resolve: Function; reject: Function }> = [];

  // Track original JID for each message to prevent thread mixing during status updates
  private messageJidMapping = new Map<string, { originalJid: string; timestamp: number }>();

  constructor(
    tenantId: string,
    private readonly config: WhatsappConfigService,
    private readonly redisService: any, // RedisService will be injected
    lockManager: SessionLockManager,
    workerId: string,
  ) {
    this.tenantId = tenantId;
    this.lockManager = lockManager;
    this.workerId = workerId;
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    await this.cleanup();
  }

  /**
   * Initialize the session by acquiring lock and setting up WhatsApp connection
   */
  async initialize(): Promise<boolean> {
    try {
      // Try to acquire lock
      const lockAcquired = await this.lockManager.acquireLock(
        this.tenantId,
        this.workerId,
        parseInt(process.env.WA_SESSION_LOCK_TTL_SEC || '300'),
      );

      if (!lockAcquired) {
        this.log.info('session.initialize.lock_failed', {
          tenantId: this.tenantId,
          workerId: this.workerId,
        });
        return false;
      }

      // Initialize Redis auth state using Baileys-compatible pattern
      const { state, saveCreds, clearAuthState } = await useRedisAuthState(this.tenantId, this.redisService);
      this.authState = state;
      this.saveCreds = saveCreds;
      this.clearAuthState = clearAuthState;

      // Start WhatsApp connection
      await this.startSocket();

      this.log.info('session.initialized', {
        tenantId: this.tenantId,
        workerId: this.workerId,
      });

      return true;
    } catch (error) {
      this.log.error('session.initialize.error', {
        tenantId: this.tenantId,
        workerId: this.workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.cleanup();
      return false;
    }
  }

  /**
   * Check if the session is currently connected
   */
  isConnected(): boolean {
    return this.connection === 'open' && this.sock !== null;
  }

  /**
   * Get the current connection state
   */
  getConnectionState(): string {
    return this.connection;
  }

  /**
   * Get the last QR code generated
   */
  getLastQr(): string | null {
    return this.lastQr;
  }

  /**
   * Send a message to a WhatsApp number with queuing and retry logic
   */
  async sendMessage(to: string, message: any): Promise<void> {
    this.log.debug?.('sendMessage.input', {
      tenantId: this.tenantId,
      originalTo: to,
      messageType: message.text ? 'text' : 'other'
    });
    // Select best target JID: if full JID provided, use as-is; if digits, prefer PN; if possible, resolve via onWhatsApp
    const target = await this.chooseOutboundJid(to);
    this.log.debug?.('sendMessage.target_resolved', {
      tenantId: this.tenantId,
      originalTo: to,
      resolvedTarget: target
    });

    // If connected, send immediately
    if (this.isConnected() && this.sock) {
      try {
        const sendRes: any = await this.sock.sendMessage(target, message);
        // Log the returned message key from Baileys to see exact remoteJid used
        const k = sendRes?.key || {};
        const messageId = k.id;

        // Track the original target JID for this message to prevent thread mixing
        if (messageId) {
          this.messageJidMapping.set(messageId, {
            originalJid: target,
            timestamp: Date.now()
          });

          // Clean up old mappings (older than 5 minutes)
          const cutoff = Date.now() - 300000;
          for (const [id, mapping] of this.messageJidMapping.entries()) {
            if (mapping.timestamp < cutoff) {
              this.messageJidMapping.delete(id);
            }
          }
        }

        this.log.info('session.message.sent', {
          tenantId: this.tenantId,
          to: target,
          remoteJidEcho: k.remoteJid || null,
          messageId: messageId || null,
          fromMe: k.fromMe || true,
          messageType: message.text ? 'text' : 'other',
        });
        // Also run JID debug on the send response
        try { debugBaileysMessage(this.tenantId, sendRes, 'outbound_sent'); } catch { }
        return;
      } catch (error) {
        this.log.warn('session.message.send.immediate_failed', {
          tenantId: this.tenantId,
          to: target,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Fall through to queue the message
      }
    }

    // Queue the message for later delivery
    return new Promise((resolve, reject) => {
      const messageItem = {
        to: target,
        message,
        resolve,
        reject
      };

      this.pendingMessages.push(messageItem);

      this.log.info('session.message.queued', {
        tenantId: this.tenantId,
        to: target,
        queueLength: this.pendingMessages.length,
        connectionState: this.connection
      });

      // Set timeout to reject if not sent within reasonable time
      setTimeout(() => {
        const index = this.pendingMessages.indexOf(messageItem);
        if (index > -1) {
          this.pendingMessages.splice(index, 1);
          reject(new Error(`Message timeout: session not connected within 60 seconds for tenant ${this.tenantId}`));
        }
      }, this.messageQueueTimeout);

      // Trigger connection attempt if not connected
      if (!this.isConnected() && !this.isShuttingDown) {
        this.triggerReconnect();
      }
    });
  }

  /**
   * Disconnect the session
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    await this.cleanup();
  }

  /**
   * Attempt to reconnect the session with exponential backoff
   */
  async reconnect(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.reconnectAttempts++;

    this.log.info('session.reconnect.attempt', {
      tenantId: this.tenantId,
      workerId: this.workerId,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts
    });

    try {
      await this.cleanup();
      const success = await this.initialize();

      if (success) {
        this.reconnectAttempts = 0; // Reset on successful reconnection
        this.log.info('session.reconnect.success', {
          tenantId: this.tenantId,
          workerId: this.workerId,
        });
      }
    } catch (error) {
      this.log.error('session.reconnect.error', {
        tenantId: this.tenantId,
        workerId: this.workerId,
        attempt: this.reconnectAttempts,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Trigger a reconnection with exponential backoff
   */
  private triggerReconnect(): void {
    if (this.isShuttingDown || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.log.error('session.reconnect.max_attempts_reached', {
          tenantId: this.tenantId,
          workerId: this.workerId,
          attempts: this.reconnectAttempts
        });

        // Fail all pending messages
        const pendingCount = this.pendingMessages.length;
        this.pendingMessages.forEach(msg => {
          msg.reject(new Error(`Max reconnection attempts reached for tenant ${this.tenantId}`));
        });
        this.pendingMessages = [];

        this.log.info('session.pending_messages.failed', {
          tenantId: this.tenantId,
          count: pendingCount
        });
      }
      return;
    }

    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000; // Add jitter to avoid thundering herd
    const totalDelay = Math.min(delay + jitter, 60000); // Cap at 60 seconds

    this.log.info('session.reconnect.scheduled', {
      tenantId: this.tenantId,
      workerId: this.workerId,
      delayMs: Math.round(totalDelay),
      attempt: this.reconnectAttempts + 1
    });

    setTimeout(() => {
      if (!this.isShuttingDown) {
        this.reconnect();
      }
    }, totalDelay);
  }

  /**
   * Start the WhatsApp socket connection
   */
  private async startSocket(): Promise<void> {
    if (!this.authState) {
      throw new Error('Auth state not initialized');
    }

    // Load Baileys dynamically
    const baileysMod = (await import('baileys')) as any;
    const makeWASocket = baileysMod.makeWASocket;
    const fetchLatestBaileysVersion = baileysMod.fetchLatestBaileysVersion;
    const makeCacheableSignalKeyStore = baileysMod.makeCacheableSignalKeyStore;
    const jidNormalizedUser = baileysMod.jidNormalizedUser || ((j: string) => j);

    // Provide a minimal logger for Baileys key store caching (needs .trace and .child)
    const noopLogger: any = { trace: () => { }, debug: () => { }, info: () => { }, warn: () => { }, error: () => { }, child: () => noopLogger };
    const pinoLogger: any = noopLogger;

    if (typeof makeWASocket !== 'function') {
      throw new Error('baileys makeWASocket not found');
    }

    // Get latest version
    let version: [number, number, number] | undefined;
    try {
      const res =
        typeof fetchLatestBaileysVersion === 'function' && (await fetchLatestBaileysVersion());
      if (res && Array.isArray(res.version)) {
        version = res.version as [number, number, number];
      }
    } catch (error) {
      this.log.warn('baileys.version.fetch.failed', {
        tenantId: this.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Wrap keys store to reduce I/O churn and align with Evolution API patterns
    const auth = {
      creds: (this.authState as any).creds,
      keys: makeCacheableSignalKeyStore((this.authState as any).keys, pinoLogger),
    };

    // Minimal message fetcher stub; integrate with DB if available
    const getMessage = async (_key: any): Promise<any | undefined> => {
      return undefined;
    };

    // Create socket with tuned stability options
    this.sock = makeWASocket({
      auth,
      browser: ['Ubuntu', 'Chrome', '120.0.0'],
      ...(version ? { version } : {}),
      logger: pinoLogger,
      // Stability tuning
      keepAliveIntervalMs: 30_000,
      connectTimeoutMs: 30_000,
      retryRequestDelayMs: 350,
      maxMsgRetryCount: 4,
      qrTimeout: 45_000,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false,
      getMessage,
    });

    const sock = this.sock;
    if (!sock) {
      throw new Error('Socket not initialized');
    }

    // Set up event handlers
    sock.ev.on('creds.update', async () => {
      try {
        if (this.saveCreds) {
          await this.saveCreds(); // Use the proper saveCreds function
        }
      } catch (error) {
        this.log.error('session.creds.save.error', {
          tenantId: this.tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    sock.ev.on('messages.upsert', (ev: unknown) => this.handleUpsert(ev as MessagesUpsertEvent));

    // Track message updates (ack/status changes) to see server-side routing
    sock.ev.on('messages.update', (data: unknown) => {
      const updates = Array.isArray(data) ? data : [];
      try {
        for (const u of updates || []) {
          const key = u.key || {};
          const status = u.update?.status ?? u.status;
          const messageId = key.id;
          const updateRemoteJid = key.remoteJid;

          // Check if this message has a tracked original JID
          const originalMapping = messageId ? this.messageJidMapping.get(messageId) : null;
          const threadMixingDetected = originalMapping &&
            originalMapping.originalJid !== updateRemoteJid;

          this.log.info('session.message.update', {
            tenantId: this.tenantId,
            messageId: messageId || null,
            remoteJid: updateRemoteJid || null,
            fromMe: key.fromMe || false,
            normalizedRemoteJid: updateRemoteJid ? jidNormalizedUser(updateRemoteJid) : null,
            originalJid: originalMapping?.originalJid || null,
            threadMixingDetected: threadMixingDetected || false,
            status,
          });

          // Log potential thread mixing
          if (threadMixingDetected) {
            this.log.warn('session.message.update.thread_mixing_detected', {
              tenantId: this.tenantId,
              messageId,
              sentToJid: originalMapping?.originalJid,
              statusFromJid: updateRemoteJid,
              status
            });
          }
        }
      } catch (e) {
        this.log.warn('session.message.update.log_error', { tenantId: this.tenantId, error: e instanceof Error ? e.message : String(e) });
      }
    });

    sock.ev.on('connection.update', (update: unknown) =>
      this.handleConnectionUpdate(update as ConnectionUpdateEvent),
    );
  }

  /**
   * Handle incoming messages
   */
  private async handleUpsert(ev: MessagesUpsertEvent): Promise<void> {
    const env = this.config.get();
    const msgs = Array.isArray(ev.messages) ? ev.messages : [];

    for (const m of msgs) {
      if (!m.message) continue;

      // Always debug message first to capture both inbound and fromMe echoes
      debugBaileysMessage(this.tenantId, m as any, m.key?.fromMe ? 'outbound_echo' : 'inbound');

      // If this is an echo of a message we sent (fromMe), process it for conversation display
      if (m.key?.fromMe) {
        this.log.info('session.outbound.echo', {
          tenantId: this.tenantId,
          remoteJid: m.key?.remoteJid || 'unknown',
          messageId: m.key?.id || null
        });

        // Process outbound echoes to show our sent messages in conversations
        const echoJid = m.key?.remoteJid || 'unknown';
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';

        if (text && text.trim().length > 0) {
          const echoPayload = {
            channel: 'whatsapp',
            messageId: m.key.id || crypto.randomUUID(),
            providerEventId: m.key.id || crypto.randomUUID(),
            tenantId: this.tenantId,
            traceId: crypto.randomUUID(),
            timestamp: Date.now(),
            sender: `bot@${this.tenantId}`, // Mark as bot message
            recipient: echoJid, // Show who we sent it to
            content: { text },
            messageType: 'outbound_echo'
          };

          try {
            // Bus messaging disabled in MVP - using direct HTTP calls instead
            // await publish('outbound.echoes', echoPayload);
            this.log.info('session.outbound.echo.published', {
              tenantId: this.tenantId,
              recipient: echoJid,
              textLength: text.length
            });
          } catch (error) {
            this.log.error('session.outbound.echo.publish.error', {
              tenantId: this.tenantId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
        continue;
      }

      const providerEventId = m.key.id || crypto.randomUUID();

      // De-dup incoming events (Baileys may emit PN/LID variants for same message)
      const shouldProcess = await this.markInboundProcessed(providerEventId);
      if (!shouldProcess) {
        this.log.debug?.('session.inbound.duplicate_discarded', { tenantId: this.tenantId, providerEventId });
        continue;
      }

      const rawSender = m.key?.remoteJid || 'unknown';
      const keyAny: any = (m as any).key || {};
      const pnAlt: string | undefined = keyAny.senderPn || keyAny.remoteJidAlt;

      // FIXED: Preserve original JID format to maintain thread consistency
      // For @lid JIDs, keep them as-is to avoid thread mixing
      // Only prefer PN format for standard @s.whatsapp.net JIDs
      let senderJid: string;
      if (rawSender.includes('@lid')) {
        // Preserve @lid JIDs exactly as received
        senderJid = rawSender;
        logJidTransformation(
          this.tenantId,
          'inbound_processing',
          rawSender,
          senderJid,
          'lid_jid_preserved',
          { pnAlt, providerEventId }
        );
      } else {
        // For non-LID JIDs, prefer PN when available
        senderJid = pnAlt || rawSender;
        if (pnAlt && pnAlt !== rawSender) {
          logJidTransformation(
            this.tenantId,
            'inbound_processing',
            rawSender,
            senderJid,
            'preferred_pn_format',
            { rawSender, pnAlt, providerEventId }
          );
        }
      }

      const basePayload = {
        channel: 'whatsapp',
        messageId: providerEventId,
        providerEventId,
        tenantId: this.tenantId,
        traceId: crypto.randomUUID(),
        timestamp: Date.now(),
        sender: senderJid,
      };

      // Handle text messages
      const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
      if (text && text.trim().length > 0) {
        const payload = { ...basePayload };
        const parsed = EnvelopeSchema.safeParse(payload);

        if (!parsed.success) {
          this.log.warn('session.message.parse.failed', {
            tenantId: this.tenantId,
            traceId: payload.traceId,
            errors: parsed.error.errors,
          });
          continue;
        }

        try {
          // Check thread consistency between different JID formats
          if (pnAlt && rawSender !== pnAlt) {
            compareJidsForThreadConsistency(
              this.tenantId,
              rawSender,
              pnAlt,
              'inbound_alternative_formats'
            );
          }

          this.log.info('session.inbound.text', {
            tenantId: this.tenantId,
            traceId: payload.traceId,
            sender: senderJid,
            len: text.length,
            rawSender,
            pnAlt: pnAlt || null,
            threadKeyUsed: senderJid.split('@')[0] // Log the actual thread key being used
          });

          // Bus messaging disabled in MVP - messages are processed locally
          // await publish('inbound.messages', { ...payload, content: { text } });
          this.log.info('session.inbound.message.processed', {
            tenantId: this.tenantId,
            traceId: payload.traceId,
            sender: senderJid,
            len: text.length
          });
        } catch (error) {
          this.log.error('session.message.publish.error', {
            tenantId: this.tenantId,
            traceId: payload.traceId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        continue;
      }

      // Handle audio messages
      if (m.message.audioMessage) {
        const audio = m.message.audioMessage;
        const mimeType = audio.mimetype || 'audio/ogg';

        try {
          // Note: Audio handling would need downloadMediaMessage function
          // This is simplified for now
          this.log.info('session.inbound.audio', {
            tenantId: this.tenantId,
            traceId: basePayload.traceId,
            sender: senderJid,
            mimeType,
          });

          // For now, just log audio messages
          // TODO: Implement audio download and processing
        } catch (error) {
          this.log.error('session.audio.process.error', {
            tenantId: this.tenantId,
            traceId: basePayload.traceId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        continue;
      }
    }
  }

  /**
   * Select outbound JID based on input and available mapping.
   */
  private async chooseOutboundJid(to: string): Promise<string> {
    // Always preserve explicit JIDs (including @lid) for thread consistency
    if (/@/.test(to)) {
      logJidTransformation(
        this.tenantId,
        'outbound_jid_selection',
        to,
        to,
        'explicit_jid_preserved',
        { method: 'chooseOutboundJid' }
      );
      return to;
    }
    // Otherwise, normalize to standard WhatsApp JID
    const pnDigits = to.replace(/[^0-9]/g, '');
    const result = pnDigits + '@s.whatsapp.net';
    logJidTransformation(
      this.tenantId,
      'outbound_jid_selection',
      to,
      result,
      'digits_only_normalized',
      { method: 'chooseOutboundJid', cleanedDigits: pnDigits }
    );
    return result;
  }

  /**
   * Mark inbound message id as processed (dedupe PN/LID variants)
   */
  private async markInboundProcessed(providerEventId: string): Promise<boolean> {
    try {
      const client = this.redisService.getClient();
      const key = this.redisService.getKey('inbound', this.tenantId, providerEventId);
      const res = await client.set(key, '1', 'EX', 60, 'NX');
      return res === 'OK';
    } catch (e) {
      // If Redis not available, don't dedupe
      this.log.warn('session.inbound.dedupe.redis_error', {
        tenantId: this.tenantId,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
      return true;
    }
  }

  /**
   * Handle connection updates with improved stability and message queue processing
   */
  private async handleConnectionUpdate(update: ConnectionUpdateEvent): Promise<void> {
    const previousConnection = this.connection;
    this.connection = update.connection || 'disconnected';

    // Handle QR code
    if (update.qr) {
      this.lastQr = update.qr;
      this.log.info('session.qr.generated', {
        tenantId: this.tenantId,
        workerId: this.workerId,
        qrLength: update.qr.length,
      });

      // Always print QR code for first-time setup or when requested
      if (process.env.WA_PRINT_QR !== '0') {
        this.printQrCode(update.qr);
      }
    }

    // Handle successful connection
    if (update.connection === 'open') {
      this.lastSuccessfulConnection = Date.now();
      this.reconnectAttempts = 0; // Reset reconnection attempts on successful connection

      // Set a timer to consider connection stable after 30 seconds
      if (this.connectionStableTimeout) {
        clearTimeout(this.connectionStableTimeout);
      }

      this.connectionStableTimeout = setTimeout(() => {
        this.log.info('session.connection.stable', {
          tenantId: this.tenantId,
          workerId: this.workerId,
          pendingMessages: this.pendingMessages.length
        });

        // Process pending messages once connection is stable
        this.processPendingMessages();
      }, this.connectionStabilityDelay);

      // Try to process pending messages immediately, but also wait for stability
      this.processPendingMessages();
    }

    // Handle disconnection
    if (update.connection === 'close') {
      // Clear stability timeout
      if (this.connectionStableTimeout) {
        clearTimeout(this.connectionStableTimeout);
        this.connectionStableTimeout = undefined;
      }

      const code =
        update.lastDisconnect?.error?.output?.statusCode ||
        update.lastDisconnect?.error?.statusCode;

      const isLoggedOut = code === LocalDisconnectReason.loggedOut;
      const errorReason = update.lastDisconnect?.error;
      // Treat certain codes as terminal to avoid reconnect loops
      const TERMINAL_CODES = new Set([401, 402, 403, 406, 440]);
      const errStr = (() => {
        try { return String(errorReason || ''); } catch { return ''; }
      })();
      const isConflict = code === 440 || errStr.includes('conflict') || errStr.includes('replaced');

      this.log.info('session.connection.closed', {
        tenantId: this.tenantId,
        workerId: this.workerId,
        code,
        reason: isLoggedOut ? 'logged_out' : (isConflict ? 'conflict' : 'connection_error'),
        errorType: errorReason?.constructor?.name || 'unknown',
        pendingMessages: this.pendingMessages.length
      });

      // Handle logged out, conflict, or terminal scenarios
      if (isLoggedOut || isConflict || (code && TERMINAL_CODES.has(code))) {
        if (isLoggedOut) {
          this.log.error('session.logged_out', {
            tenantId: this.tenantId,
            workerId: this.workerId
          });
        } else if (isConflict) {
          this.log.error('session.conflict_detected', {
            tenantId: this.tenantId,
            workerId: this.workerId
          });
        } else {
          this.log.error('session.terminal_error', {
            tenantId: this.tenantId,
            workerId: this.workerId,
            code
          });
        }

        // Optionally clear auth state on conflict or logout to force fresh QR next time
        if (this.clearAuthState && (isLoggedOut || isConflict) && process.env.WA_CLEAR_AUTH_ON_CONFLICT !== '0') {
          try {
            await this.clearAuthState();
            this.log.info('session.auth_state.cleared_for_fresh_qr', {
              tenantId: this.tenantId,
              workerId: this.workerId,
              reason: isLoggedOut ? 'logged_out' : 'conflict'
            });
          } catch (error) {
            this.log.error('session.auth_state.clear_failed', {
              tenantId: this.tenantId,
              workerId: this.workerId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Fail all pending messages with terminal error
        const pendingCount = this.pendingMessages.length;
        this.pendingMessages.forEach(msg => {
          msg.reject(new Error(`Session terminal state for tenant ${this.tenantId} - manual re-authentication may be required`));
        });
        this.pendingMessages = [];

        if (pendingCount > 0) {
          this.log.info('session.pending_messages.failed_terminal', {
            tenantId: this.tenantId,
            count: pendingCount
          });
        }

        return; // Don't attempt reconnection for terminal states
      }

      // Attempt reconnection for other errors if not shutting down
      if (!this.isShuttingDown) {
        this.triggerReconnect();
      }
    }

    // Log connection state changes
    if (previousConnection !== this.connection) {
      this.log.info('session.connection.state_changed', {
        tenantId: this.tenantId,
        workerId: this.workerId,
        from: previousConnection,
        to: this.connection,
      });
    }
  }

  /**
   * Process pending messages when connection becomes stable
   */
  private async processPendingMessages(): Promise<void> {
    if (!this.isConnected() || !this.sock || this.pendingMessages.length === 0) {
      return;
    }

    const messagesToProcess = [...this.pendingMessages];
    this.pendingMessages = [];

    this.log.info('session.pending_messages.processing', {
      tenantId: this.tenantId,
      count: messagesToProcess.length
    });

    let successCount = 0;
    let failureCount = 0;

    for (const msgItem of messagesToProcess) {
      try {
        if (this.isConnected() && this.sock) {
          const sendRes: any = await this.sock.sendMessage(msgItem.to, msgItem.message);
          msgItem.resolve();
          successCount++;

          const k = sendRes?.key || {};
          const messageId = k.id;

          // Track the original target JID for pending messages too
          if (messageId) {
            this.messageJidMapping.set(messageId, {
              originalJid: msgItem.to,
              timestamp: Date.now()
            });
          }

          this.log.info('session.pending_message.sent', {
            tenantId: this.tenantId,
            to: msgItem.to,
            remoteJidEcho: k.remoteJid || null,
            messageId: messageId || null,
            fromMe: k.fromMe || true,
            messageType: msgItem.message.text ? 'text' : 'other'
          });
          try { debugBaileysMessage(this.tenantId, sendRes, 'outbound_sent'); } catch { }
        } else {
          // Connection lost during processing, re-queue the message
          this.pendingMessages.push(msgItem);
          this.log.warn('session.pending_message.requeued', {
            tenantId: this.tenantId,
            to: msgItem.to,
            reason: 'connection_lost_during_processing'
          });
        }

        // Add small delay between messages to avoid overwhelming WhatsApp
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        msgItem.reject(error);
        failureCount++;

        this.log.error('session.pending_message.failed', {
          tenantId: this.tenantId,
          to: msgItem.to,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.log.info('session.pending_messages.processed', {
      tenantId: this.tenantId,
      success: successCount,
      failed: failureCount,
      requeued: this.pendingMessages.length
    });
  }

  /**
   * Print QR code to console
   */
  private printQrCode(qr: string): void {
    try {
      // Try qrcode-terminal first
      const qrcodeTerminal = require('qrcode-terminal');
      qrcodeTerminal.generate(qr, { small: true }, (ascii: string) => {
        console.log(`\n================ WHATSAPP QR (${this.tenantId}) ================`);
        console.log(ascii);
        console.log(`[wa.qr.raw.${this.tenantId}]`, qr);
      });
    } catch {
      try {
        // Fallback to qrcode
        const qrcode = require('qrcode');
        qrcode.toString(qr, { type: 'terminal', small: true }).then((ascii: string) => {
          console.log(`\n================ WHATSAPP QR (${this.tenantId}) ================`);
          console.log(ascii);
          console.log(`[wa.qr.raw.${this.tenantId}]`, qr);
        });
      } catch {
        console.log(`[wa.qr.raw.${this.tenantId}]`, qr);
      }
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    // Clear renewal timer
    if (this.lockRenewalInterval) {
      clearInterval(this.lockRenewalInterval);
      this.lockRenewalInterval = undefined;
    }

    // Clear connection stability timeout
    if (this.connectionStableTimeout) {
      clearTimeout(this.connectionStableTimeout);
      this.connectionStableTimeout = undefined;
    }

    // Disconnect socket
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (error) {
        this.log.warn('session.socket.logout.error', {
          tenantId: this.tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      this.sock = null;
    }

    // Release lock
    try {
      await this.lockManager.releaseLock(this.tenantId, this.workerId);
    } catch (error) {
      this.log.warn('session.lock.release.error', {
        tenantId: this.tenantId,
        workerId: this.workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    this.connection = 'disconnected';
    this.lastQr = null;
    this.authState = null;
    this.saveCreds = null;

    this.log.info('session.cleaned_up', {
      tenantId: this.tenantId,
      workerId: this.workerId,
      pendingMessages: this.pendingMessages.length
    });
  }
}
