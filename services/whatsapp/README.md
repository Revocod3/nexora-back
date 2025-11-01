# WhatsApp Connector

MVP single-instance WhatsApp connector using Baileys (multi-device) for inbound/outbound text.

## Endpoints

- `GET /health` basic status.
- `GET /wa/qr` (protected by `X-Internal-Key` if `WA_INTERNAL_SHARED_KEY` set) returns `{ status, qr }`.
- `POST /wa/send` (protected) body: `{ to?: string, jid?: string, text: string }`.

## Env Vars

```
SINGLE_TENANT_ID=tenant-dev
WA_INTERNAL_SHARED_KEY=dev-shared-key
WA_AUTH_DIR=./wa-auth
CRM_BASE_URL=http://localhost:8000   # future use (persist creds)
CRM_API_KEY=                         # future use
```

## Running Locally

```bash
pnpm install
pnpm dev:connector:wa
```

Scan QR in terminal (Baileys prints) or query `/wa/qr` to retrieve it.

Send test message (after session established):

```bash
curl -XPOST http://localhost:3011/wa/send \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: dev-shared-key" \
  -d '{"to":"1234567890","text":"hola"}'
```

## Inbound Flow

1. Baileys emits `messages.upsert`.
2. Connector normalizes minimal envelope and publishes to topic `inbound.messages` on internal bus.
3. Downstream services consume and act (not implemented yet).

## Outbound Flow

1. Upstream publishes to `agent.replies` with `{ channel: 'whatsapp', to: '1234567890', body: '...' }`.
2. Connector consumer sends message via Baileys if connected.

## Redis Bus Integration

Para que el Orchestrator (otro proceso) reciba los eventos inbound necesitas activar el backend Redis del paquete `@la/bus`:

```
export BUS_REDIS_URL=redis://localhost:6379/0
export BUS_REDIS_PREFIX=bus
```

Sin estas variables el bus funciona solo en memoria y los servicios en procesos separados no se verán entre sí.

## Security (MVP)

- Single shared secret header for internal endpoints.
- No rate limiting yet.

## TODO

- Persist auth state blobs to CRM.
- Idempotency on inbound events.
- Media handling.
- Multi-tenant session registry.
