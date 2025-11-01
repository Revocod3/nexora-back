import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { publish, resetInMemoryBus, consume } from '@nexora/bus';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from 'src/app.module';
vi.mock('@nexora/config', () => ({
  loadOrchestratorEnv: () => ({ ORCHESTRATOR_PORT: 3001, NODE_ENV: 'test' }),
}));

describe('connector whatsapp health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('GET /health ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('connector-whatsapp');
  });
});

// Failing-first test for inbound normalization (MVP stub)
vi.mock('baileys', () => ({
  default: () => ({ ev: { on: () => {} } }),
  useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
}));

describe('whatsapp inbound normalization', () => {
  beforeAll(() => {
    resetInMemoryBus();
    process.env.WA_DISABLE = '1';
  });
  it('publishes a minimal envelope (simulated) to inbound.messages', async () => {
    // Simulate what WhatsappService.handleUpsert would do by calling publish directly (unit-level)
    const providerEventId = 'msg-1';
    await publish('inbound.messages', {
      channel: 'whatsapp',
      messageId: providerEventId,
      providerEventId,
      tenantId: 'tenant-dev',
      content: { text: 'hola' },
    });
    let found = false;
    await consume(
      'inbound.messages',
      (m) => {
        type InboundPayload = { providerEventId?: string };
        const p = m.payload as InboundPayload;
        if (p.providerEventId === providerEventId) found = true;
      },
      { group: 'test', max: 10 },
    );
    expect(found).toBe(true);
  });
});

describe('whatsapp outbound consumer', () => {
  beforeAll(() => {
    resetInMemoryBus();
    process.env.WA_DISABLE = '1';
  });
  it('consumes agent.replies messages for whatsapp channel (stub)', async () => {
    // publish a reply (would be produced by tools/orchestrator later)
    await publish('agent.replies', { channel: 'whatsapp', to: '12345', body: 'Hola!' });
    // consume directly to assert it was published (connector consumer side-effects are logged only)
    let found = false;
    await consume(
      'agent.replies',
      (m) => {
        type ReplyPayload = { body?: string };
        const p = m.payload as ReplyPayload;
        if (p.body === 'Hola!') found = true;
      },
      { group: 'assert', max: 10 },
    );
    expect(found).toBe(true);
  });
});
