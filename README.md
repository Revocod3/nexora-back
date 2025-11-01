# Nexora Back

Real estate lead management platform with WhatsApp integration and AI agents.

## Architecture

```
┌─────────────────┐
│  WhatsApp User  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ WhatsApp        │────▶│  CRM Service     │
│ Connector       │◀────│  - Agent Logic   │
│ (Baileys)       │     │  - OpenAI        │
└─────────────────┘     │  - AdminJS       │
                        │  - PostgreSQL    │
                        └──────────────────┘
```

## Services

- **CRM**: NestJS backend with integrated AI agent logic, AdminJS panel, and PostgreSQL
- **WhatsApp**: Connector using Baileys for WhatsApp Web integration

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Fill in required values (OpenAI key, passwords, etc.)
nano .env

# 3. Start services
docker compose up -d

# 4. Get WhatsApp QR code
docker logs realtec-whatsapp

# 5. Access Admin Panel
open http://localhost:8000/admin
```

## Development

```bash
# Install dependencies
pnpm install

# Run CRM in dev mode
cd services/crm && pnpm dev

# Run WhatsApp in dev mode
cd services/whatsapp && pnpm dev
```

## Stack

- **Backend**: NestJS + TypeORM + PostgreSQL
- **Admin**: AdminJS
- **AI**: OpenAI API (gpt-4o)
- **WhatsApp**: Baileys
- **Container**: Docker + Docker Compose

## License

Proprietary
