# Contrato de API - Nexora CRM

**Versión:** 1.0.0 | **Última actualización:** 2025-11-09

---

## Autenticación

**JWT requerido en todos los endpoints excepto:**
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/health`

**Header:**
```http
Authorization: Bearer <access_token>
```

**JWT Payload:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "tenantId": "tenant-uuid",
  "role": "OWNER"
}
```

---

## Errores

```json
{
  "statusCode": 400,
  "message": "Error message",
  "error": "Bad Request"
}
```

**Códigos:** 200, 201, 400, 401, 403, 404, 409, 422, 500

---

## Endpoints Principales

### Auth

#### `POST /api/auth/signup`
```json
{
  "tenantName": "Salón Madrid",
  "email": "owner@salon.com",
  "password": "Pass123!",
  "ownerName": "Juan Pérez",
  "subdomain": "salonmadrid",
  "whatsappNumber": "+34612345678"
}
```
**→** Retorna: `{ access_token, tenant, user }`

#### `POST /api/auth/login`
```json
{
  "email": "owner@salon.com",
  "password": "Pass123!",
  "subdomain": "salonmadrid"  // OPCIONAL pero recomendado
}
```
**→** Retorna: `{ access_token, tenant, user }`

**Nota:** `subdomain` es opcional. Si se envía, busca email SOLO en ese tenant. Si no, busca en cualquier tenant (útil para dev).

#### `GET /api/auth/me`
**→** Retorna: `{ user: {...}, tenant: {...} }`

---

### Dashboard

#### `GET /api/dashboard/stats`
**→** `{ appointmentsToday, revenue7d, popularServices[], recentClients[] }`

#### `GET /api/dashboard/appointments/today`
**→** `[{ id, client, service, startsAt, status }]`

---

### Services

#### `GET /api/services`
**→** Lista de servicios activos del tenant

#### `POST /api/services`
```json
{
  "name": "Corte de Pelo",
  "description": "Corte profesional",
  "duration_minutes": 45,
  "price": 25.00,
  "currency": "EUR"
}
```

#### `PATCH /api/services/:id`
**⚠️ Valida tenant:** Solo puede actualizar servicios de su tenant

#### `POST /api/services/:id/deactivate`
**⚠️ Valida tenant:** Soft delete

---

### Appointments

#### `GET /api/appointments`
**→** Lista de citas del tenant

#### `POST /api/appointments`
```json
{
  "serviceId": "uuid",          // REQUERIDO
  "staffId": "uuid",            // opcional
  "datetime": "2025-11-10T10:00:00Z",
  "clientName": "Ana García",   // requerido si no hay userId
  "clientPhone": "+34666777888",
  "notes": "Primera vez",
  "userId": "uuid"              // opcional
}
```

#### `PATCH /api/appointments/:id`
**⚠️ Valida tenant:** Solo puede actualizar citas de su tenant
```json
{
  "datetime": "...",    // opcional
  "status": "CONFIRMED",
  "notes": "...",
  "cancellationReason": "..."
}
```

**Nota:** NO se puede cambiar serviceId/staffId en PATCH (cancelar y crear nueva)

#### `DELETE /api/appointments/:id`
**⚠️ Valida tenant:** Hard delete

---

### Staff

#### `GET /api/staff` / `GET /api/staff/active`
**→** Lista de staff del tenant

#### `POST /api/staff`
```json
{
  "name": "María López",
  "email": "maria@salon.com",
  "phone": "+34666111222",
  "role": "STYLIST",  // STYLIST|BARBER|COLORIST|etc
  "availability": { "monday": ["09:00-14:00"] }
}
```

---

### WhatsApp

Todos requieren JWT:
- `GET /api/whatsapp/status` → `{ connected, number }`
- `GET /api/whatsapp/qr` → `{ qr: "data:image/png..." }`
- `POST /api/whatsapp/number` → Body: `{ number }`
- `POST /api/whatsapp/logout` → `{ success, message }`

---

## Ejemplos cURL

### Signup
```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Salón Madrid","email":"owner@salon.com","password":"Pass123!","ownerName":"Juan"}'
```

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@salon.com","password":"Pass123!","subdomain":"salonmadrid"}'
```

### Crear Servicio
```bash
curl -X POST http://localhost:8000/api/services \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Corte","duration_minutes":45,"price":25.00}'
```

### Crear Cita
```bash
curl -X POST http://localhost:8000/api/appointments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"serviceId":"uuid","datetime":"2025-11-10T10:00:00Z","clientName":"Ana","clientPhone":"+34666777888"}'
```

---

## Seguridad Implementada

✅ JWT Global Guard
✅ Tenant isolation (todos los queries filtran por tenantId)
✅ PATCH/DELETE validation (valida pertenencia al tenant)
✅ Password hashing (bcrypt)
✅ Login scoping por subdomain

⚠️ **Pendiente:** Helmet, Rate Limiting, CORS específico, Migrations

---

## Variables de Entorno

```env
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=change-in-production
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000
WHATSAPP_SERVICE_URL=http://localhost:3011/wa
CRM_INTERNAL_API_KEY=internal-key
NODE_ENV=development
```
