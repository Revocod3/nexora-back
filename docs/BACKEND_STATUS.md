# Backend Status - Nexora CRM

**Fecha de última actualización:** 2025-11-09

## Estado Actual del Backend

### ✅ Configuración Completada

#### 1. **Autenticación y Seguridad**
- **JWT Authentication**: Implementado con `JwtAuthGuard` como `APP_GUARD` global
- **Multitenancy**: Segregación por tenant usando decoradores `@CurrentTenant()` y `@CurrentUser()`
- **Login**: Soporta scoping opcional por `subdomain` en `/api/auth/login`
- **Protección de Rutas**:
  - `/api/auth/signup` - Público (`@Public()`)
  - `/api/auth/login` - Público (`@Public()`)
  - `/api/auth/me` - Requiere JWT
  - Todas las demás rutas requieren JWT por defecto (APP_GUARD global)

#### 2. **Endpoints Internos**
- **`/internal/upsert_user`**: Protegido con `ApiKeyGuard` (NO requiere JWT)
  - Headers requeridos: `x-api-key`, `idempotency-key`
  - Usa `CRM_INTERNAL_API_KEY` del .env

#### 3. **WhatsApp Module** (Opción A - JWT)
- **DECISIÓN TOMADA**: WhatsApp usa JWT authentication (no API Key)
- **Endpoints** (`/api/whatsapp/*`):
  - `GET /api/whatsapp/status` - Requiere JWT
  - `GET /api/whatsapp/qr` - Requiere JWT
  - `POST /api/whatsapp/number` - Requiere JWT
  - `POST /api/whatsapp/logout` - Requiere JWT
- **Estado Actual**: ✅ Ya configurado correctamente (no requiere cambios)
- **Frontend debe enviar**: Header `Authorization: Bearer <token>`

#### 4. **Appointments**
- **CreateAppointmentDto**:
  - ✅ `serviceId` es **requerido** (`@IsUUID()`)
  - Frontend debe enviar `serviceId` (UUID del servicio)
- **UpdateAppointmentDto**:
  - ✅ NO permite cambiar `service`, `duration`, ni `price`
  - Campos actualizables: `datetime`, `clientName`, `clientPhone`, `status`, `notes`, `cancellationReason`
- **Tenant Isolation**: ✅ Implementado en PATCH/DELETE

#### 5. **Services**
- **Tenant Isolation**: ✅ Implementado en operaciones de actualización/borrado
- **Deactivate endpoint**: ✅ Validado por tenant

#### 6. **CORS y Seguridad**
- **CORS**: Configurado con `FRONTEND_URL` (default: `http://localhost:3000`)
- **Headers permitidos**: `Content-Type`, `Authorization`, `x-api-key`, `idempotency-key`
- **Helmet**: ✅ Activado
- **Rate Limiting**: ✅ 100 req/min (ThrottlerGuard)
- **Validation**: ✅ Global ValidationPipe con `whitelist: true`

#### 7. **Swagger Documentation**
- **URL**: `http://localhost:8000/api/docs`
- **Auth schemes**:
  - Bearer Auth (JWT) - para todas las rutas autenticadas
  - API Key (`x-api-key`) - para endpoints internos

---

## Variables de Entorno Requeridas

### Producción (.env)
```bash
# System
NODE_ENV=production
SINGLE_TENANT_ID=tenant-prod

# Database
POSTGRES_DB=nexora_db
POSTGRES_USER=nexora_user
POSTGRES_PASSWORD=<your-secure-password>
DB_HOST=localhost
DB_PORT=5432

# Service Ports
CRM_PORT=8000
WHATSAPP_PORT=3011
PORT=8000

# Frontend
FRONTEND_URL=http://localhost:3000

# JWT Authentication
JWT_SECRET=<generate-with-openssl-rand-hex-32>
JWT_EXPIRES_IN=7d

# Security - API Keys
CRM_INTERNAL_API_KEY=<generate-with-openssl-rand-hex-32>

# WhatsApp Service
WHATSAPP_SERVICE_URL=http://localhost:3011/wa

# AdminJS
ADMIN_EMAIL=admin@nexora.com
ADMIN_PASSWORD=<your-admin-password>
ADMIN_COOKIE_SECRET=<generate-with-openssl-rand-hex-32>
ADMIN_SESSION_SECRET=<generate-with-openssl-rand-hex-32>

# OpenAI
OPENAI_API_KEY=<your-openai-key>
OPENAI_MODEL=gpt-4o

# WhatsApp Connector
WA_PRINT_QR=1
WA_FORCE_RELOGIN=0
```

**⚠️ IMPORTANTE**: En producción, asegurar que `synchronize: false` en TypeORM y usar migraciones.

---

## Decisiones de Diseño

### 1. WhatsApp Authentication
- **Decisión**: Usar JWT (Opción A)
- **Razón**: Coherencia con el resto del sistema; el panel requiere sesión de usuario
- **Implicación Frontend**: Debe enviar `Authorization: Bearer <token>` en todas las llamadas a `/api/whatsapp/*`

### 2. Appointments - serviceId
- **Decisión**: Exigir `serviceId` (UUID) en crear cita
- **Razón**: Consistencia y evitar ambigüedades al buscar por nombre
- **Implicación Frontend**: Debe enviar `serviceId` obtenido del listado de servicios

### 3. Appointments - Update Restrictions
- **Decisión**: NO permitir cambiar servicio/duración/precio en update
- **Razón**: Integridad de datos; cambiar servicio requiere lógica compleja
- **Implicación Frontend**: No enviar `serviceId`, `duration`, `price` en PATCH

### 4. Endpoint Interno
- **Decisión**: `/internal/upsert_user` usa `ApiKeyGuard` (no JWT)
- **Razón**: Endpoint para integraciones externas/webhooks, no sesiones de usuario
- **Implicación**: Llamadas internas deben usar header `x-api-key`

---

## Compatibilidad con Frontend (nexora-front)

### ✅ Lo que ya funciona
1. **Estructura de endpoints**: Todos los endpoints esperados existen
2. **Formato de respuestas**: DTOs alineados con interfaces del frontend
3. **Segregación por tenant**: Implementada en todos los módulos críticos
4. **CORS**: Configurado correctamente

### ⚠️ Requiere Ajustes en Frontend

#### 1. **Implementar Login y JWT**
```typescript
// El frontend debe:
// 1. Llamar a POST /api/auth/login con { email, password, subdomain? }
// 2. Guardar el token JWT de la respuesta
// 3. Incluir en TODAS las llamadas: Authorization: Bearer <token>
```

#### 2. **Appointments - Enviar serviceId**
```typescript
// CreateAppointmentDto en frontend debe incluir:
{
  serviceId: string;     // UUID (requerido)
  datetime: string;      // ISO 8601
  clientName?: string;
  clientPhone?: string;
  duration?: number;     // Opcional (se toma del servicio si no se envía)
  price?: number;        // Opcional (se toma del servicio si no se envía)
  notes?: string;
  userId?: string;
  staffId?: string;
}
```

#### 3. **WhatsApp - Usar Authorization Header**
```typescript
// Cambiar de:
headers: { 'x-api-key': API_KEY }

// A:
headers: { 'Authorization': `Bearer ${token}` }
```

---

## Endpoints Disponibles

### Authentication
- `POST /api/auth/signup` - Crear cuenta (público)
- `POST /api/auth/login` - Login (público)
  - Body: `{ email, password, subdomain? }`
- `GET /api/auth/me` - Obtener usuario actual (JWT requerido)

### Dashboard
- `GET /api/dashboard` - Estadísticas (JWT + tenant)

### Clients
- `GET /api/clients` - Listar clientes (JWT + tenant)
- `GET /api/clients/:id` - Obtener cliente (JWT + tenant)
- `POST /api/clients` - Crear cliente (JWT + tenant)
- `PATCH /api/clients/:id` - Actualizar cliente (JWT + tenant)
- `DELETE /api/clients/:id` - Eliminar cliente (JWT + tenant)

### Services
- `GET /api/services` - Listar servicios (JWT + tenant)
- `GET /api/services/:id` - Obtener servicio (JWT + tenant)
- `POST /api/services` - Crear servicio (JWT + tenant)
- `PATCH /api/services/:id` - Actualizar servicio (JWT + tenant)
- `POST /api/services/:id/deactivate` - Desactivar servicio (JWT + tenant)

### Appointments
- `GET /api/appointments` - Listar citas (JWT + tenant)
- `GET /api/appointments/:id` - Obtener cita (JWT + tenant)
- `POST /api/appointments` - Crear cita (JWT + tenant)
  - **Requiere**: `serviceId` (UUID)
- `PATCH /api/appointments/:id` - Actualizar cita (JWT + tenant)
  - **NO permite**: cambiar `serviceId`, `duration`, `price`
- `DELETE /api/appointments/:id` - Eliminar cita (JWT + tenant)

### WhatsApp
- `GET /api/whatsapp/status` - Estado de conexión (JWT)
- `GET /api/whatsapp/qr` - Obtener QR (JWT)
- `POST /api/whatsapp/number` - Emparejar número (JWT)
- `POST /api/whatsapp/logout` - Cerrar sesión WhatsApp (JWT)

### Internal
- `POST /internal/upsert_user` - Crear/actualizar usuario (API Key)
  - Headers: `x-api-key`, `idempotency-key`

---

## Próximos Pasos Recomendados

### Backend
1. ✅ `.env.example` actualizado con todas las variables
2. ⚠️ Generar secretos para producción (`JWT_SECRET`, `CRM_INTERNAL_API_KEY`, etc.)
3. ⚠️ Verificar que `synchronize: false` en producción
4. ⚠️ Crear migraciones si hay cambios de esquema pendientes
5. ⚠️ Agregar tests para endpoints críticos

### Frontend
1. **Implementar flujo de login**:
   - Llamar a `/api/auth/login`
   - Almacenar JWT (localStorage/sessionStorage)
   - Configurar interceptor HTTP para agregar `Authorization: Bearer <token>`
2. **Actualizar creación de citas**:
   - Enviar `serviceId` (UUID) en lugar de nombre
3. **Actualizar módulo WhatsApp**:
   - Cambiar de `x-api-key` a `Authorization: Bearer <token>`
4. **Manejar errores 401**:
   - Redirigir a login cuando el token expire o sea inválido

---

## Testing

### Manual Testing
```bash
# 1. Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 2. Usar el token en otras llamadas
TOKEN="<token-from-login>"
curl -X GET http://localhost:8000/api/dashboard \
  -H "Authorization: Bearer $TOKEN"

# 3. WhatsApp status
curl -X GET http://localhost:8000/api/whatsapp/status \
  -H "Authorization: Bearer $TOKEN"
```

---

## Notas Adicionales

- **Multitenancy**: Todos los recursos están aislados por tenant automáticamente vía decoradores
- **Single tenant mode**: Configurado con `SINGLE_TENANT_ID` para simplificar en producción inicial
- **Swagger**: Disponible en `/api/docs` con ejemplos de autenticación
- **Rate limiting**: 100 requests/min por IP (ajustable en `app.module.ts`)
