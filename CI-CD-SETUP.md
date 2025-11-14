# CI/CD Setup Guide

Este documento explica cómo configurar el pipeline de CI/CD para auto-deployment a Hetzner.

## 🚀 Descripción del Pipeline

El pipeline consta de dos workflows:

### 1. **CI (Continuous Integration)** - `.github/workflows/ci.yml`
Se ejecuta en cada Pull Request y push a `main`:
- ✅ Linting
- ✅ Type checking
- ✅ Build verification
- ✅ Tests
- ✅ Docker build test
- ✅ Security audit

### 2. **CD (Continuous Deployment)** - `.github/workflows/deploy.yml`
Se ejecuta automáticamente en cada commit a `main`:
- 🚀 Conecta vía SSH a Hetzner
- 📦 Pull del código más reciente
- 🔨 Rebuild de las imágenes Docker
- 🔄 Restart de los servicios
- ✅ Verificación de health checks

## 📋 Requisitos Previos

### 1. En el servidor Hetzner

El código debe estar clonado en tu servidor:

```bash
# Ejemplo: clonar el repositorio
ssh root@your-server-ip
cd /opt
git clone https://github.com/Revocod3/nexora-back.git
cd nexora-back

# Copiar y configurar .env
cp .env.example .env
nano .env  # Editar con tus valores reales

# Hacer el script de deploy ejecutable
chmod +x scripts/deploy.sh
```

### 2. Generar SSH Key para GitHub Actions

```bash
# En tu máquina local
ssh-keygen -t ed25519 -C "github-actions-nexora" -f ~/.ssh/github-actions-nexora

# Esto genera dos archivos:
# - github-actions-nexora (private key) - para GitHub Secrets
# - github-actions-nexora.pub (public key) - para el servidor
```

### 3. Agregar la public key al servidor Hetzner

```bash
# Copiar la public key al servidor
ssh-copy-id -i ~/.ssh/github-actions-nexora.pub root@your-server-ip

# O manualmente:
cat ~/.ssh/github-actions-nexora.pub
# Copiar el output y pegarlo en el servidor:
ssh root@your-server-ip
nano ~/.ssh/authorized_keys
# Pegar la key al final del archivo
```

## 🔐 Configurar GitHub Secrets

Ve a tu repositorio en GitHub:
**Settings → Secrets and variables → Actions → New repository secret**

Crea los siguientes secrets:

| Secret Name | Descripción | Ejemplo |
|-------------|-------------|---------|
| `SSH_HOST` | IP o dominio del servidor Hetzner | `123.45.67.89` o `nexora.example.com` |
| `SSH_USER` | Usuario SSH (normalmente `root`) | `root` |
| `SSH_PRIVATE_KEY` | La **private key** completa (contenido del archivo `github-actions-nexora`) | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` |
| `SSH_PORT` | Puerto SSH (opcional, default: 22) | `22` |
| `PROJECT_DIR` | Path donde está el código en el servidor | `/opt/nexora-back` |

### Cómo obtener la private key:

```bash
cat ~/.ssh/github-actions-nexora
```

Copia **TODO** el contenido (incluyendo `-----BEGIN OPENSSH PRIVATE KEY-----` y `-----END OPENSSH PRIVATE KEY-----`) y pégalo en el secret `SSH_PRIVATE_KEY`.

## 🎯 Cómo Funciona

### Deploy Automático (en cada commit a main)

```bash
# Hacer cambios en una branch
git checkout -b feature/nueva-funcionalidad
# ... hacer cambios ...
git add .
git commit -m "feat: nueva funcionalidad"
git push origin feature/nueva-funcionalidad

# Crear PR en GitHub
# Una vez aprobado y merged a main:
# ✨ El deploy se ejecuta automáticamente!
```

### Deploy Manual

También puedes ejecutar el deploy manualmente:

**GitHub → Actions → Deploy to Hetzner → Run workflow → Run workflow**

### Verificar el Deploy

```bash
# Conectarte al servidor para ver logs
ssh root@your-server-ip
cd /opt/nexora-back
docker compose logs -f
```

## 🔧 Personalización

### Cambiar el directorio del proyecto

Si tu código está en otro path (por ejemplo `/home/ubuntu/nexora-back`):

1. Actualiza el secret `PROJECT_DIR` en GitHub
2. O modifica `scripts/deploy.sh`:
   ```bash
   PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/nexora-back}"
   ```

### Cambiar la branch de deployment

Por defecto deploya `main`. Para cambiar a otra branch:

Edita `.github/workflows/deploy.yml`:
```yaml
on:
  push:
    branches:
      - production  # Cambiar aquí
```

### Deploy sin downtime (Zero-downtime deployment)

Para aplicaciones de alta disponibilidad, considera usar **Docker Swarm** o **Kubernetes**.

Para una solución simple con Docker Compose:

```bash
# En lugar de down/up, usa:
docker compose up -d --no-deps --build crm
docker compose up -d --no-deps --build whatsapp
```

Modifica `scripts/deploy.sh` según tus necesidades.

## 🐛 Troubleshooting

### Error: "Permission denied (publickey)"

- Verifica que la public key esté en `~/.ssh/authorized_keys` del servidor
- Verifica que la private key en GitHub Secrets sea la correcta
- Verifica que el usuario SSH sea correcto

### Error: "Project directory not found"

- Verifica que `PROJECT_DIR` en GitHub Secrets apunte al path correcto
- Verifica que el repositorio esté clonado en ese path

### El deploy falla pero no muestra errores

- Conéctate al servidor y revisa los logs:
  ```bash
  ssh root@your-server-ip
  cd /opt/nexora-back
  docker compose logs
  ```

### Los cambios no se reflejan después del deploy

- Verifica que el branch correcto se haya pulled:
  ```bash
  ssh root@your-server-ip
  cd /opt/nexora-back
  git log -1
  git status
  ```

## 📊 Monitoreo

### Ver status del último deploy

**GitHub → Actions** - Verás el status de cada workflow run

### Ver logs del deploy

Click en el workflow run → Deploy to Production → Deploy to Hetzner via SSH

### Notificaciones

Para recibir notificaciones de deploys fallidos, agrega al final de `.github/workflows/deploy.yml`:

```yaml
      - name: Notify on failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 🔒 Seguridad

- ✅ Nunca commitees la private key al repositorio
- ✅ Usa GitHub Secrets para información sensible
- ✅ Considera usar una key SSH dedicada solo para CI/CD
- ✅ Revisa periódicamente los permisos de la key
- ✅ Considera agregar whitelist de IPs en el firewall de Hetzner

## 📚 Recursos

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [SSH Action](https://github.com/appleboy/ssh-action)
- [Docker Compose](https://docs.docker.com/compose/)

## ✅ Checklist de Setup

- [ ] Código clonado en servidor Hetzner
- [ ] Archivo `.env` configurado en servidor
- [ ] SSH key generada
- [ ] Public key agregada al servidor
- [ ] GitHub Secrets configurados:
  - [ ] SSH_HOST
  - [ ] SSH_USER
  - [ ] SSH_PRIVATE_KEY
  - [ ] PROJECT_DIR
- [ ] Primer deploy manual exitoso
- [ ] Pipeline de CI/CD funcionando

---

¿Preguntas? Revisa los logs en GitHub Actions o conéctate al servidor para debugging.
