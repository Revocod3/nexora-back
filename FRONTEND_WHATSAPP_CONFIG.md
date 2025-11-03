# Configuración WhatsApp - Frontend

## 🎯 Problema Resuelto

El frontend estaba llamando a `/api/whatsapp/status` pero recibía 404 porque:
1. El endpoint existía pero estaba mal configurado
2. Llamaba a `/wa/ping` que solo devuelve `{ok: true}` sin estado de conexión
3. Ahora llama correctamente a `/wa/qr` que devuelve el estado real

## 📡 Endpoints Disponibles

Todos los endpoints están bajo el servicio **CRM** (puerto 8000) con prefijo `/api/whatsapp`:

### 1. **GET /api/whatsapp/status**
Obtiene el estado de conexión de WhatsApp.

**Respuesta exitosa (200):**
```json
{
  "connected": true,
  "number": "5215512345678",
  "status": "open"
}
```

**Respuesta desconectado (200):**
```json
{
  "connected": false,
  "number": null,
  "status": "close"
}
```

**Respuesta servicio no disponible (503):**
```json
{
  "connected": false,
  "number": null,
  "error": "WhatsApp service unavailable",
  "details": "connect ECONNREFUSED 172.18.0.3:3011"
}
```

**Estados posibles:**
- `open`: Conectado y listo
- `connecting`: Conectando/esperando QR
- `close`: Desconectado
- `forbidden`: Error de autenticación

### 2. **GET /api/whatsapp/qr**
Obtiene el código QR para vincular WhatsApp.

**Respuesta (200):**
```json
{
  "qr": "data:image/png;base64,iVBORw0KG..."
}
```

**Error (503):**
```json
{
  "statusCode": 503,
  "message": "Failed to get QR code. Make sure WhatsApp service is running."
}
```

### 3. **POST /api/whatsapp/number**
Vincula WhatsApp con un número de teléfono (pairing code).

**Body:**
```json
{
  "number": "5215512345678"
}
```

**Respuesta (200):**
```json
{
  "ok": true,
  "code": "ABCD1234",
  "phoneNumber": "5215512345678",
  "tenantId": "tenant-prod"
}
```

### 4. **POST /api/whatsapp/logout**
Cierra sesión y elimina la autenticación.

**Respuesta (200):**
```json
{
  "success": true,
  "message": "WhatsApp session reset successfully"
}
```

## 🔧 Configuración del Frontend

### Variables de Entorno (.env.local)

```bash
# URL del backend CRM
NEXT_PUBLIC_API_URL=http://localhost:8000

# Tenant ID (opcional, si usas multi-tenant)
NEXT_PUBLIC_TENANT_ID=tenant-prod

# API Key (opcional, para endpoints protegidos)
NEXT_PUBLIC_API_KEY=tu-api-key-aqui
```

### Configuración en producción

```bash
# Si el frontend y backend están en el mismo dominio
NEXT_PUBLIC_API_URL=https://tudominio.com

# Si están en dominios diferentes
NEXT_PUBLIC_API_URL=https://api.tudominio.com
```

## 🚀 Actualización del Cliente API (Frontend)

En tu archivo `src/lib/api.ts` o donde configures las llamadas HTTP:

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Función para obtener estado
export async function getWhatsAppStatus() {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // Si usas API key:
      // 'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// Función para obtener QR
export async function getWhatsAppQR() {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp/qr`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get QR code');
  }
  
  return response.json();
}

// Función para emparejar con número
export async function pairWhatsAppNumber(number: string) {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp/number`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to pair number');
  }
  
  return response.json();
}

// Función para logout
export async function logoutWhatsApp() {
  const response = await fetch(`${API_BASE_URL}/api/whatsapp/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to logout');
  }
  
  return response.json();
}
```

## 🔍 Testing Local

### 1. Verificar que el servicio CRM está corriendo:
```bash
curl http://localhost:8000/api/health
```

### 2. Probar el endpoint de status:
```bash
curl http://localhost:8000/api/whatsapp/status
```

### 3. Obtener QR (si está desconectado):
```bash
curl http://localhost:8000/api/whatsapp/qr
```

### 4. Emparejar con número:
```bash
curl -X POST http://localhost:8000/api/whatsapp/number \
  -H "Content-Type: application/json" \
  -d '{"number": "5215512345678"}'
```

## 🐳 Testing en Docker

Los servicios se comunican internamente usando nombres de Docker:
- CRM: `http://crm:8000`
- WhatsApp: `http://whatsapp:3011`

Para probar desde fuera del contenedor:
```bash
# Verificar que los contenedores están corriendo
docker ps

# Verificar el endpoint de status
curl http://localhost:8000/api/whatsapp/status

# Ver logs del CRM
docker logs nexora-crm

# Ver logs del WhatsApp
docker logs nexora-whatsapp
```

## 🔒 Seguridad

### Headers Requeridos (en producción)

Si configuras `CRM_INTERNAL_API_KEY` en tu `.env`, los endpoints del servicio WhatsApp requieren:

```
x-internal-key: tu-clave-secreta
```

El controlador del CRM se encarga de agregar este header automáticamente cuando llama al servicio WhatsApp.

### CORS

El CRM ya está configurado para aceptar peticiones desde tu frontend:
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
});
```

Asegúrate de configurar `FRONTEND_URL` en tu `.env` en producción.

## 🆘 Troubleshooting

### Error: "Failed to fetch"
- Verifica que `NEXT_PUBLIC_API_URL` apunte al servidor correcto
- Revisa que el servicio CRM esté corriendo
- Checa la configuración de CORS

### Error 503: "WhatsApp service unavailable"
- El servicio WhatsApp no está corriendo o no es accesible
- Revisa: `docker logs nexora-whatsapp`
- Verifica: `docker ps | grep whatsapp`

### Error 404: "Cannot GET /api/whatsapp/status"
- El CRM no está corriendo
- El prefijo global está mal configurado
- Verifica: `curl http://localhost:8000/api/health`

### Muestra "Desconectado" cuando debería estar conectado
- El endpoint `/wa/qr` del servicio WhatsApp devuelve `status: "close"`
- Puede que la sesión se haya cerrado
- Intenta hacer logout y volver a conectar

### No aparece el QR
- El servicio WhatsApp está iniciando (espera 30s)
- Ya está conectado (verifica status)
- Error en el servicio (revisa logs)

## 📊 Monitoreo

### Verificar estado completo del sistema:

```bash
# Health check del CRM
curl http://localhost:8000/api/health

# Health check del WhatsApp
curl http://localhost:3011/health

# Estado de conexión
curl http://localhost:8000/api/whatsapp/status

# Ver todos los contenedores
docker ps -a

# Logs en tiempo real
docker logs -f nexora-crm
docker logs -f nexora-whatsapp
```

---

**Última actualización:** 2025-11-03  
**Versión del CRM:** 1.0  
**Versión del servicio WhatsApp:** 1.0
