# 🚀 Nexora Back - Deployment Guide

## Pre-requisitos

- [x] Docker Desktop instalado y en ejecución
- [x] Docker WSL2 integration activada
- [x] Archivo `.env` configurado

## Verificación de Docker

```bash
# Verificar que Docker esté disponible
docker --version
docker compose version

# Debería mostrar:
# Docker version 24.x.x
# Docker Compose version v2.x.x
```

## 🏗️ Build y Deploy (Producción)

### Opción 1: Build y Start en un solo comando

```bash
# Construir imágenes y levantar servicios
pnpm docker:build
pnpm docker:up

# Ver logs en tiempo real
pnpm docker:logs
```

### Opción 2: Build por separado

```bash
# 1. Construir imágenes Docker
docker compose build

# 2. Levantar servicios
docker compose up -d

# 3. Ver logs
docker compose logs -f
```

## 📱 Conectar WhatsApp

```bash
# Ver el QR code para escanear con WhatsApp
docker logs nexora-whatsapp -f

# Escanear el QR con WhatsApp > Dispositivos Vinculados
```

## 🎯 Acceder a los Servicios

- **Admin Panel**: http://localhost:8000/admin
  - Email: `admin@nexora.com`
  - Password: (ver en `.env`)

- **CRM API**: http://localhost:8000
- **WhatsApp API**: http://localhost:3011

## 🧪 Health Checks

```bash
# Verificar que todos los servicios estén healthy
docker compose ps

# Debería mostrar todos en "healthy" status
```

## 🛠️ Desarrollo Local (sin Docker)

Si prefieres desarrollo local sin Docker:

```bash
# 1. Asegúrate de tener PostgreSQL corriendo localmente
# 2. Actualiza .env con DB_HOST=localhost

# 3. Instalar dependencias
pnpm install

# 4. En terminal 1: CRM
pnpm dev:crm

# 5. En terminal 2: WhatsApp
pnpm dev:whatsapp
```

## 🔄 Comandos Útiles

```bash
# Ver logs de un servicio específico
docker logs nexora-crm -f
docker logs nexora-whatsapp -f
docker logs nexora-postgres -f

# Reiniciar un servicio
docker compose restart crm
docker compose restart whatsapp

# Detener todo
pnpm docker:down

# Detener y borrar volúmenes (⚠️ borra datos)
docker compose down -v

# Rebuild de un servicio específico
docker compose build crm
docker compose up -d crm

# Ver uso de recursos
docker stats
```

## 🐛 Troubleshooting

### Docker no está disponible
1. Abre Docker Desktop
2. Settings > Resources > WSL Integration
3. Activa tu distribución WSL2
4. Click "Apply & Restart"
5. Espera 30 segundos y prueba: `docker --version`

### Error de permisos en WSL2
```bash
sudo usermod -aG docker $USER
```

### Error de build: pnpm-lock.yaml
```bash
# Regenerar lockfile
pnpm install
git add pnpm-lock.yaml
docker compose build
```

### WhatsApp no conecta
```bash
# Forzar nuevo login
docker compose down
docker volume rm nexora-whatsapp-auth
docker compose up -d
docker logs nexora-whatsapp -f
```

### Base de datos corrupta
```bash
# ⚠️ Esto borra todos los datos
docker compose down -v
docker compose up -d
```

## 📊 Monitoring

```bash
# Ver recursos en tiempo real
docker stats

# Ver logs con timestamps
docker compose logs -f --timestamps

# Ver solo errores
docker compose logs | grep -i error
```

## 🚢 Deploy a Producción

### 1. Preparar servidor

```bash
# En tu servidor (Ubuntu/Debian)
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

### 2. Clonar y configurar

```bash
git clone <tu-repo>
cd nexora-back
cp .env.example .env
nano .env  # Configurar con valores de producción
```

### 3. Deploy

```bash
docker compose build
docker compose up -d
docker compose logs -f
```

### 4. Backup de datos

```bash
# Backup de PostgreSQL
docker exec nexora-postgres pg_dump -U nexora_user nexora_db > backup.sql

# Backup de WhatsApp auth
docker cp nexora-whatsapp:/app/auth_info ./backup-whatsapp-auth
```

## 📝 Notas

- **Turborepo**: Usa caché para builds más rápidos
- **Monorepo**: Todos los servicios comparten dependencias
- **Hot Reload**: `pnpm dev` tiene hot reload activo
- **TypeScript**: Todo el código es TypeScript
