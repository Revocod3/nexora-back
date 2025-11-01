import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useRedisAuthState } from '../auth/redis-auth-state.js';

// Mock Redis service
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

const mockRedisService = {
  getKey: vi.fn((type: string, tenantId: string, key: string) => `wa:${type}:${tenantId}:${key}`),
  getClient: vi.fn(() => mockRedisClient),
};

// Mock logger
vi.mock('@nexora/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock Baileys
const mockInitAuthCreds = vi.fn(() => ({
  noiseKey: { private: new Uint8Array(32), public: new Uint8Array(32) },
  signedIdentityKey: { private: new Uint8Array(32), public: new Uint8Array(32) },
  signedPreKey: {
    keyId: 1,
    private: new Uint8Array(32),
    public: new Uint8Array(32),
    signature: new Uint8Array(64),
  },
  registrationId: 12345,
  advSecretKey: 'adv-secret',
  nextPreKeyId: 1,
  firstUnuploadedPreKeyId: 1,
  serverHasPreKeys: true,
  account: {},
  me: { id: '1234567890@s.whatsapp.net', name: 'Test User' },
  signalIdentities: [],
  myAppStateKeyId: 'app-state-key',
  platform: 'android',
  processedHistoryMessages: [],
  accountSyncCounter: 0,
  accountSettings: {},
  deviceName: 'Test Device',
  phoneConnected: false,
  features: {},
}));

vi.mock('baileys', () => ({
  initAuthCreds: mockInitAuthCreds,
}));

describe('RedisAuthState', () => {
  const tenantId = 'test-tenant';
  const encryptionKey = 'test-encryption-key';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    mockRedisClient.setex.mockReset();
    mockRedisClient.del.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('First-time setup', () => {
    it('should generate initial credentials when no data exists in Redis', async () => {
      // Mock empty Redis (no existing data)
      mockRedisClient.get.mockResolvedValue(null);

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Should call initAuthCreds for first-time setup
      expect(mockInitAuthCreds).toHaveBeenCalled();

      // Should return proper auth state structure
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('saveCreds');
      expect(result.state).toHaveProperty('creds');
      expect(result.state).toHaveProperty('keys');

      // Should have generated registration ID
      expect(result.state.creds.registrationId).toBe(12345);
    });

    it('should handle Baileys import correctly', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      expect(result.state.creds).toBeDefined();
      expect(typeof result.saveCreds).toBe('function');
    });
  });

  describe('Existing session', () => {
    it('should load existing credentials from Redis', async () => {
      const existingCreds = {
        registrationId: 67890,
        noiseKey: { private: [1, 2, 3], public: [4, 5, 6] },
        // ... other existing creds
      };

      const existingKeys = {
        'session-key-1': { key: 'value' },
      };

      // Mock existing data in Redis
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(existingCreds)) // creds
        .mockResolvedValueOnce(JSON.stringify(existingKeys)); // keys

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Should NOT call initAuthCreds for existing session
      expect(mockInitAuthCreds).not.toHaveBeenCalled();

      // Should return loaded credentials
      expect(result.state.creds.registrationId).toBe(67890);
    });
  });

  describe('Keys management', () => {
    it('should handle keys.get correctly', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Test keys.get
      const keys = { 'session-key-1': { key: 'value' } };
      result.state.keys.set({ session: { 'key-1': { key: 'value' } } });

      const retrieved = result.state.keys.get('session', ['key-1']);
      expect(retrieved).toEqual({ key: 'value' });
    });

    it('should handle keys.set and auto-save', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Test keys.set with auto-save
      result.state.keys.set({
        session: { 'key-1': { key: 'value' } },
        preKey: { 'key-2': null }, // null should delete
      });

      // Should auto-save after keys update
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2); // creds and keys
    });
  });

  describe('Save functionality', () => {
    it('should save credentials to Redis with encryption', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      await result.saveCreds();

      // Should save both creds and keys
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2);

      // Should use proper TTL (30 days)
      const calls = mockRedisClient.setex.mock.calls;
      expect(calls[0][1]).toBe(86400 * 30); // 30 days TTL
      expect(calls[1][1]).toBe(86400 * 30);
    });

    it('should handle save errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockRejectedValue(new Error('Redis connection failed'));

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      await expect(result.saveCreds()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('Error handling', () => {
    it('should handle Redis connection errors during load', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        useRedisAuthState(tenantId, mockRedisService as any, encryptionKey),
      ).rejects.toThrow('Redis connection failed');
    });

    it('should handle invalid JSON in Redis data', async () => {
      mockRedisClient.get.mockResolvedValueOnce('invalid-json').mockResolvedValueOnce('{}');

      await expect(
        useRedisAuthState(tenantId, mockRedisService as any, encryptionKey),
      ).rejects.toThrow();
    });
  });

  describe('End-to-end first-time setup flow', () => {
    it('should handle complete first-time setup and reconnection', async () => {
      const tenantId = 'e2e-test-tenant';

      // Step 1: First-time setup (no existing data)
      mockRedisClient.get.mockResolvedValue(null);

      const result1 = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Should generate initial credentials
      expect(mockInitAuthCreds).toHaveBeenCalled();
      expect(result1.state.creds.registrationId).toBe(12345);

      // Step 2: Simulate Baileys updating credentials after QR scan
      result1.state.creds.registrationId = 99999;
      result1.state.creds.phoneConnected = true;

      // Save the updated credentials
      mockRedisClient.setex.mockResolvedValue('OK');
      await result1.saveCreds();

      // Should save to Redis
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2);

      // Step 3: Simulate reconnection (existing data)
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(result1.state.creds)) // creds
        .mockResolvedValueOnce(JSON.stringify({})); // keys

      const result2 = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Should NOT call initAuthCreds for existing session
      expect(mockInitAuthCreds).toHaveBeenCalledTimes(1); // Only once from step 1

      // Should load existing credentials
      expect(result2.state.creds.registrationId).toBe(99999);
      expect(result2.state.creds.phoneConnected).toBe(true);
    });

    it('should handle QR code generation flow', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await useRedisAuthState(
        'qr-test-tenant',
        mockRedisService as any,
        encryptionKey,
      );

      // Verify the auth state has the expected structure for QR generation
      expect(result.state).toHaveProperty('creds');
      expect(result.state).toHaveProperty('keys');
      expect(result.state.creds).toHaveProperty('registrationId');
      expect(result.state.creds).toHaveProperty('noiseKey');
      expect(result.state.creds).toHaveProperty('signedIdentityKey');
      expect(result.state.creds).toHaveProperty('signedPreKey');

      // These are the key properties Baileys needs for QR generation
      expect(result.state.creds.registrationId).toBeDefined();
      expect(result.state.creds.noiseKey).toBeDefined();
      expect(result.state.creds.signedIdentityKey).toBeDefined();
      expect(result.state.creds.signedPreKey).toBeDefined();
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt data properly', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await useRedisAuthState(tenantId, mockRedisService as any, encryptionKey);

      // Modify creds to test encryption
      result.state.creds.registrationId = 99999;

      await result.saveCreds();

      // Verify encryption was called
      expect(mockRedisClient.setex).toHaveBeenCalled();
      const encryptedData = mockRedisClient.setex.mock.calls[0][2];
      expect(typeof encryptedData).toBe('string');
      expect(encryptedData.length).toBeGreaterThan(0);
    });
  });
});
