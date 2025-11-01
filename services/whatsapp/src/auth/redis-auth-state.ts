import { RedisService } from './redis.service.js';
import { createLogger } from '@nexora/logger';
import crypto from 'node:crypto';

// Baileys types (minimal interface to avoid direct imports)
interface AuthenticationCreds {
  noiseKey: { private: Uint8Array; public: Uint8Array };
  signedIdentityKey: { private: Uint8Array; public: Uint8Array };
  signedPreKey: { keyId: number; private: Uint8Array; public: Uint8Array; signature: Uint8Array };
  registrationId: number;
  advSecretKey: string;
  nextPreKeyId: number;
  firstUnuploadedPreKeyId: number;
  serverHasPreKeys: boolean;
  account: any;
  me: any;
  signalIdentities: any[];
  myAppStateKeyId: string;
  platform: string;
  processedHistoryMessages: any[];
  accountSyncCounter: number;
  accountSettings: any;
  deviceName: string;
  phoneConnected: boolean;
  features: any;
}

interface AuthenticationState {
  creds: AuthenticationCreds;
  keys: any;
}

interface RedisAuthStateResult {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAuthState: () => Promise<void>;
}

/**
 * Creates a Redis-based auth state compatible with Baileys useMultiFileAuthState
 * This replaces file-based persistence with Redis while maintaining the same interface
 */
export async function useRedisAuthState(
  tenantId: string,
  redis: RedisService,
  encryptionKey?: string,
): Promise<RedisAuthStateResult> {
  const log = createLogger('connector-whatsapp-redis-auth');
  const encKey = encryptionKey || process.env.WA_ENCRYPTION_KEY || 'default-key-change-in-prod';
  const disableEncryption =
    process.env.NODE_ENV === 'test' || process.env.WA_DISABLE_ENCRYPTION === 'true';

  // Test BufferJSON availability (only when explicitly enabled)
  const baileysMod = await import('baileys');
  const debugBaileys = process.env.WA_DEBUG_BAILEYS === '1';
  if (debugBaileys) {
    console.log('Testing BufferJSON availability:');
    console.log('Available exports:', Object.keys(baileysMod));
    console.log(
      'Default export keys:',
      baileysMod.default ? Object.keys(baileysMod.default) : 'No default',
    );
    console.log('BufferJSON via default:', typeof (baileysMod as any).default?.BufferJSON);
    console.log('BufferJSON direct:', typeof (baileysMod as any).BufferJSON);
  }

  // Load existing state from Redis or create initial credentials
  const credsKey = redis.getKey('auth', tenantId, 'creds');
  const keysKey = redis.getKey('auth', tenantId, 'keys');

  const client = redis.getClient();
  const [credsData, keysData] = await Promise.all([client.get(credsKey), client.get(keysKey)]);

  let creds: AuthenticationCreds;
  let keys: any = {};

  if (credsData && keysData) {
    // Existing session - load from Redis
    try {
      const credsJson = disableEncryption ? credsData : decrypt(credsData, encKey);
      const keysJson = disableEncryption ? keysData : decrypt(keysData, encKey);

      // Parse with BufferJSON to handle Uint8Arrays properly
      const BufferJSON = getBufferJSON(baileysMod);

      if (BufferJSON) {
        creds = JSON.parse(credsJson, BufferJSON.reviver);
        keys = JSON.parse(keysJson, BufferJSON.reviver);
        log.info('redis.auth.state.loaded.with_bufferjson', { tenantId });
      } else {
        // Fallback: manual Uint8Array restoration
        creds = JSON.parse(credsJson, reviveUint8Arrays);
        keys = JSON.parse(keysJson, reviveUint8Arrays);
        log.info('redis.auth.state.loaded.manual_uint8array', { tenantId });
      }

      log.info('redis.auth.state.loaded.existing', {
        tenantId,
        hasCreds: true,
        hasKeys: true,
        encrypted: !disableEncryption,
      });
    } catch (error) {
      log.error('redis.auth.state.load.failed', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Create new credentials if loading fails
      try {
        const baileysMod = await import('baileys');
        const initAuthCreds =
          (baileysMod as any).initAuthCreds || (baileysMod as any).default?.initAuthCreds;
        creds = initAuthCreds();
        keys = {};
        log.warn('redis.auth.state.fallback.created', { tenantId });
      } catch (fallbackError) {
        log.error('redis.auth.state.fallback.failed', {
          tenantId,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
        });
        throw fallbackError;
      }
    }
  } else {
    // First-time setup - generate initial credentials using Baileys
    log.info('redis.auth.state.first_time_setup', {
      tenantId,
    });

    // Dynamically import Baileys to get initAuthCreds
    const baileysMod = await import('baileys');
    const initAuthCreds =
      (baileysMod as any).initAuthCreds || (baileysMod as any).default?.initAuthCreds;

    if (typeof initAuthCreds !== 'function') {
      throw new Error('baileys initAuthCreds not found - ensure compatible version');
    }

    creds = initAuthCreds();
    keys = {};

    log.info('redis.auth.state.initialized', {
      tenantId,
      registrationId: creds.registrationId,
    });
  }

  // Save function that persists to Redis
  async function saveCreds() {
    try {
      // Stringify with BufferJSON to handle Uint8Arrays properly
      const baileysMod = await import('baileys');
      const BufferJSON = getBufferJSON(baileysMod);

      const credsJson = BufferJSON
        ? JSON.stringify(state.creds, BufferJSON.replacer)
        : JSON.stringify(state.creds, replaceUint8Arrays);
      const keysJson = BufferJSON
        ? JSON.stringify(keys, BufferJSON.replacer)
        : JSON.stringify(keys, replaceUint8Arrays);

      const credsData = disableEncryption ? credsJson : encrypt(credsJson, encKey);
      const keysData = disableEncryption ? keysJson : encrypt(keysJson, encKey);

      await Promise.all([
        client.setex(credsKey, 86400 * 30, credsData), // 30 days TTL
        client.setex(keysKey, 86400 * 30, keysData),
      ]);

      log.info('redis.auth.state.saved', {
        tenantId,
        hasCreds: true,
        registrationId: state.creds.registrationId,
        encrypted: !disableEncryption,
      });
    } catch (error) {
      log.error('redis.auth.state.save.failed', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  // Create state object with proper credentials
  const state: AuthenticationState = {
    creds,
    keys: {
      // Ensure async return with proper object-map shape. Reconstruct app-state-sync-key values.
      get: async (type: string, ids: string[]) => {
        const out: Record<string, any> = {};
        for (const id of ids) {
          const storageKey = `${type}-${id}`;
          let value = keys[storageKey];
          if (value !== undefined) {
            if (type === 'app-state-sync-key') {
              try {
                const proto = (await import('baileys') as any).proto;
                // Recreate as AppStateSyncKeyData if plain object
                if (proto?.Message?.AppStateSyncKeyData && !('toJSON' in (value || {}))) {
                  value = proto.Message.AppStateSyncKeyData.create(value);
                }
              } catch { }
            }
            out[id] = value;
          }
        }
        return out; // Return object map keyed by id as expected by Baileys
      },
      set: (data: any) => {
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            const storageKey = `${category}-${id}`;
            if (value) {
              keys[storageKey] = value;
            } else {
              delete keys[storageKey];
            }
          }
        }
        // Auto-save after key updates
        saveCreds().catch((err) =>
          log.error('redis.auth.state.keys.save.failed', {
            tenantId,
            error: err instanceof Error ? err.message : 'Unknown error',
          }),
        );
      },
    },
  };

  log.info('redis.auth.state.ready', {
    tenantId,
    hasExistingCreds: !!(credsData && keysData),
    registrationId: state.creds.registrationId,
  });

  return { state, saveCreds, clearAuthState };

  /**
   * Clear auth state from Redis (for logout scenarios)
   */
  async function clearAuthState() {
    try {
      await Promise.all([
        client.del(credsKey),
        client.del(keysKey)
      ]);

      log.info('redis.auth.state.cleared', {
        tenantId,
        reason: 'logout_or_session_invalid'
      });
    } catch (error) {
      log.error('redis.auth.state.clear.failed', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(data: string, encryptionKey: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.alloc(0));
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine salt + iv + authTag + encrypted data
  return Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, 'hex')]).toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData: string, encryptionKey: string): string {
  const buffer = Buffer.from(encryptedData, 'base64');
  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 32);
  const authTag = buffer.subarray(32, 48);
  const encrypted = buffer.subarray(48);

  const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.alloc(0));
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Try to get BufferJSON from Baileys module using different patterns
 */
function getBufferJSON(baileysMod: any): any {
  // Pattern 1: Direct export
  if (baileysMod.BufferJSON) {
    return baileysMod.BufferJSON;
  }

  // Pattern 2: Default export property
  if (baileysMod.default?.BufferJSON) {
    return baileysMod.default.BufferJSON;
  }

  // Pattern 3: Try require (for CommonJS compatibility)
  try {
    const required = require('baileys');
    if (required.BufferJSON) {
      return required.BufferJSON;
    }
  } catch (e) {
    // Ignore require errors
  }

  return null;
}

/**
 * Manual Uint8Array replacer for JSON.stringify when BufferJSON is not available
 */
function replaceUint8Arrays(key: string, value: any): any {
  if (value instanceof Uint8Array) {
    return {
      type: 'Uint8Array',
      data: Array.from(value),
    };
  }
  if (value instanceof Buffer) {
    return {
      type: 'Buffer',
      data: Array.from(value),
    };
  }
  return value;
}

/**
 * Manual Uint8Array reviver for JSON.parse when BufferJSON is not available
 */
function reviveUint8Arrays(key: string, value: any): any {
  if (
    value &&
    typeof value === 'object' &&
    value.type === 'Uint8Array' &&
    Array.isArray(value.data)
  ) {
    return new Uint8Array(value.data);
  }
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return value;
}
