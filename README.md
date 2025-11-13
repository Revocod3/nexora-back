# Nexora Back

Real estate lead management platform with WhatsApp integration and AI agents.

## 🏗️ Architecture

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

## 📦 Services

- **CRM**: NestJS backend with integrated AI agent logic, AdminJS panel, and PostgreSQL
- **WhatsApp**: Connector using Baileys for WhatsApp Web integration

## 🚀 Quick Start

### 1. Prerequisites
- Docker Desktop installed and running
- WSL2 integration enabled (Settings > Resources > WSL Integration)

### 2. Verify Setup
```bash
# Run pre-deployment checks
./scripts/verify-deploy.sh
```

### 3. Configure Environment
```bash
# Copy environment file
cp .env.example .env

# Edit and fill in required values (OpenAI key, passwords, etc.)
nano .env
```

### 4. Deploy
```bash
# Build and start all services
pnpm docker:build
pnpm docker:up

# View logs
pnpm docker:logs
```

### 5. Connect WhatsApp
```bash
# Get WhatsApp QR code
docker logs nexora-whatsapp -f

# Scan with WhatsApp > Linked Devices
```

### 6. Access Admin Panel
```
http://localhost:8000/admin
```
- Email: `admin@nexora.com`
- Password: (see your `.env` file)

## 💻 Development

### With Turborepo (Recommended)
```bash
# Install dependencies
pnpm install

# Run all services in dev mode
pnpm dev

# Or run individually
pnpm dev:crm        # CRM service only
pnpm dev:whatsapp   # WhatsApp service only

# Build all
pnpm build

# Run tests
pnpm test
```

### Without Docker
```bash
# 1. Start PostgreSQL locally
# 2. Update .env with DB_HOST=localhost

# 3. Install dependencies
pnpm install

# 4. Run services
pnpm dev:crm        # Terminal 1
pnpm dev:whatsapp   # Terminal 2
```

## 🛠️ Tech Stack

- **Backend**: NestJS + TypeORM + PostgreSQL
- **Admin**: AdminJS
- **AI**: OpenAI API (gpt-4o)
- **WhatsApp**: Baileys
- **Monorepo**: Turborepo + pnpm workspaces
- **Container**: Docker + Docker Compose

## 🔄 CI/CD

Automated deployment pipeline con GitHub Actions:
- ✅ **CI**: Tests, linting, build verification en cada PR
- 🚀 **CD**: Auto-deployment a Hetzner en cada commit a `main`
- 🔧 Manual deployment trigger disponible

Para configurar el pipeline, ver [CI/CD Setup Guide](./CI-CD-SETUP.md)

## 📚 Documentation

- [Deployment Guide](./DEPLOYMENT.md) - Comprehensive deployment instructions
- [API Documentation](http://localhost:8000/api) - Swagger docs (when running)

## 🔧 Useful Commands

```bash
# Docker commands
pnpm docker:up      # Start services
pnpm docker:down    # Stop services
pnpm docker:logs    # View logs
pnpm docker:build   # Build images

# Development
pnpm dev            # Run all in dev mode
pnpm build          # Build all services
pnpm test           # Run tests

# Turbo commands
turbo dev --filter crm      # Dev mode for CRM only
turbo build --filter crm    # Build CRM only
turbo test                  # Test all packages
```

## 🐛 Troubleshooting

### Docker not found
1. Open Docker Desktop
2. Go to Settings > Resources > WSL Integration
3. Enable integration for your WSL distro
4. Click "Apply & Restart"
5. Wait 30 seconds and try: `docker --version`

### Can't connect to WhatsApp
```bash
# Force new login
docker compose down
docker volume rm nexora-whatsapp-auth
docker compose up -d
docker logs nexora-whatsapp -f
```

### Build fails
```bash
# Clean and rebuild
docker compose down
pnpm install
docker compose build --no-cache
docker compose up -d
```

For more troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 📝 Project Structure

```
nexora-back/
├── services/
│   ├── crm/           # NestJS CRM service
│   └── whatsapp/      # WhatsApp connector
├── shared/            # Shared packages
│   ├── bus/           # Event bus
│   ├── config/        # Configuration
│   ├── contracts/     # Type contracts
│   ├── logger/        # Logging utility
│   └── tracing/       # Distributed tracing
├── scripts/           # Utility scripts
├── docker-compose.yaml
├── turbo.json         # Turborepo config
└── pnpm-workspace.yaml
```

## 📄 License

Proprietary

