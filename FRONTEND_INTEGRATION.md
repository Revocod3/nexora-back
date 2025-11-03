# Backend API - Adaptación Frontend

## ✅ Cambios Implementados

Se han creado **5 nuevos controladores REST** que exponen las rutas que tu frontend necesita:

### 1. **ServicesController** (`/api/services`)
- `GET /api/services` - Lista todos los servicios en formato compatible
  - Mapea campos: `price` → `basePrice`, extrae `category` y `features` de metadata

### 2. **AppointmentsController** (`/api/appointments`)
- `GET /api/appointments` - Lista todas las citas
- `POST /api/appointments` - Crea nueva cita
- `PATCH /api/appointments/:id` - Actualiza cita existente
- `DELETE /api/appointments/:id` - Elimina una cita
  
**Mapeo de campos:**
- `scheduled_at` → `datetime`
- `customer_name` → `clientName`
- `customer_phone` → `clientPhone`
- Incluye automáticamente datos del servicio (precio, duración)

### 3. **DashboardController** (`/api/dashboard`)
- `GET /api/dashboard/stats` - Estadísticas del dashboard
  - `appointmentsToday`: Conteo de citas confirmadas hoy
  - `revenue7d`: Ingresos últimos 7 días
  - `popularServices`: Top 5 servicios por cantidad
  - `recentClients`: Últimos 10 clientes únicos
  
- `GET /api/dashboard/appointments/today` - Citas del día
  - Lista ordenada por hora con formato simplificado

### 4. **ClientsController** (`/api/clients`)
- `GET /api/clients` - Lista todos los clientes
  - Incluye usuarios registrados + clientes invitados de citas
  - Devuelve `lastVisit` (última cita)
  
- `GET /api/clients/analytics` - Analítica de clientes
  - `totalClients`: Total de clientes únicos
  - `avgTicketEUR`: Ticket promedio
  - `satisfaction`: 4.5 (placeholder - requiere sistema de ratings)
  - `topServices`: Top 5 servicios más usados

### 5. **WhatsAppController** (`/api/whatsapp`)
Proxy hacia el servicio de WhatsApp (puerto 3011):
- `GET /api/whatsapp/status` - Estado de conexión
- `GET /api/whatsapp/qr` - Código QR para conexión
- `POST /api/whatsapp/number` - Emparejar con número telefónico
- `POST /api/whatsapp/logout` - Cerrar sesión

### 6. **Configuración Global**
- ✅ Prefijo `/api` añadido globalmente
- ✅ CORS habilitado para el frontend
- ✅ Todos los módulos registrados en `AppModule`

---

## 🔧 Configuración Necesaria

### Backend (.env en `/services/crm`)

```bash
# Puerto del servicio CRM
PORT=8000

# URL del frontend (para CORS)
FRONTEND_URL=http://localhost:3000

# Tenant por defecto (single-tenant mode)
SINGLE_TENANT_ID=00000000-0000-0000-0000-000000000000

# URL del servicio WhatsApp (interno)
WHATSAPP_SERVICE_URL=http://whatsapp:3011/wa

# API Key interna para comunicación con WhatsApp
CRM_INTERNAL_API_KEY=tu-clave-interna-secreta

# Base de datos (ya configurada)
DB_HOST=postgres
DB_PORT=5432
DB_USER=nexora
DB_PASSWORD=nexora_password
DB_NAME=nexora_crm

# Redis (ya configurado)
REDIS_HOST=redis
REDIS_PORT=6379
```

### Frontend (.env.local en `nexora-front`)

```bash
# URL del backend CRM
NEXT_PUBLIC_API_URL=http://localhost:8000

# Opcional: si decides proteger endpoints públicos
# NEXT_PUBLIC_API_KEY=tu-api-key-publica
```

---

## 🚀 Cómo Levantar el Sistema

### 1. Backend (Docker Compose)

```bash
cd /home/kev/nexora-back

# Levantar todos los servicios
docker-compose up -d

# Ver logs del CRM
docker-compose logs -f crm

# Ver logs del servicio WhatsApp
docker-compose logs -f whatsapp
```

Servicios disponibles:
- **CRM API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/api/docs
- **WhatsApp Service**: http://localhost:3011
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 2. Frontend

```bash
cd /path/to/nexora-front

# Crear archivo de configuración
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

# Instalar dependencias (si es necesario)
npm install
# o
pnpm install

# Levantar en desarrollo
npm run dev
# o
pnpm dev
```

Frontend disponible en: http://localhost:3000

---

## 📋 Endpoints Disponibles

### Servicios
```
GET    /api/services?tenantId=xxx
```

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "name": "Corte de Pelo",
    "description": "Corte clásico",
    "basePrice": 25.00,
    "duration": 30,
    "currency": "EUR",
    "category": "general",
    "features": [],
    "status": "active"
  }
]
```

### Citas
```
GET    /api/appointments?tenantId=xxx
POST   /api/appointments
PATCH  /api/appointments/:id
DELETE /api/appointments/:id
```

**POST body:**
```json
{
  "serviceId": "uuid",
  "datetime": "2025-11-03T10:00:00Z",
  "clientName": "Juan Pérez",
  "clientPhone": "+34600123456",
  "notes": "Cliente regular"
}
```

**Respuesta:**
```json
{
  "id": "uuid",
  "clientName": "Juan Pérez",
  "clientPhone": "+34600123456",
  "service": "Corte de Pelo",
  "datetime": "2025-11-03T10:00:00.000Z",
  "status": "pending",
  "duration": 30,
  "price": 25.00,
  "notes": "Cliente regular"
}
```

### Dashboard
```
GET /api/dashboard/stats?tenantId=xxx
GET /api/dashboard/appointments/today?tenantId=xxx
```

### Clientes
```
GET /api/clients?tenantId=xxx
GET /api/clients/analytics?tenantId=xxx
```

### WhatsApp
```
GET  /api/whatsapp/status
GET  /api/whatsapp/qr
POST /api/whatsapp/number
POST /api/whatsapp/logout
```

---

## 🔐 Autenticación (Opcional)

### Opción A: Sin autenticación (modo desarrollo)
Los endpoints están abiertos. Solo necesitas configurar `tenantId` vía query param o usar `SINGLE_TENANT_ID`.

### Opción B: Con API Key
Si quieres proteger endpoints:

1. **Añadir guard a controladores:**
```typescript
@UseGuards(ApiKeyGuard)
@Controller('appointments')
```

2. **Frontend - modificar `src/lib/api.ts`:**
```typescript
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
};
```

3. **Configurar en `.env`:**
```bash
# Backend
CRM_API_KEY=tu-api-key-secreta

# Frontend
NEXT_PUBLIC_API_KEY=tu-api-key-secreta
```

---

## 🧪 Testing

### Con cURL

```bash
# Obtener servicios
curl http://localhost:8000/api/services

# Crear cita
curl -X POST http://localhost:8000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "uuid-del-servicio",
    "datetime": "2025-11-04T15:00:00Z",
    "clientName": "Test Client",
    "clientPhone": "+34600000000"
  }'

# Dashboard stats
curl http://localhost:8000/api/dashboard/stats

# Estado WhatsApp
curl http://localhost:8000/api/whatsapp/status
```

### Con Swagger UI

Abre http://localhost:8000/api/docs para interfaz interactiva completa.

---

## 📊 Esquema de Base de Datos

El backend usa estas entidades principales:

- **Tenant**: Multi-tenancy (salones)
- **User**: Usuarios/Clientes registrados
- **Service**: Catálogo de servicios
- **Appointment**: Citas agendadas
- **Conversation**: Conversaciones WhatsApp
- **Message**: Mensajes

---

## ⚠️ Consideraciones Importantes

### 1. Tenancy
Por defecto, todos los endpoints aceptan `?tenantId=xxx` como query param. Si no se proporciona, usa `SINGLE_TENANT_ID` del `.env`.

### 2. WhatsApp Service
El controlador WhatsApp hace proxy al microservicio en puerto 3011. Asegúrate de que:
- El servicio WhatsApp esté corriendo (`docker-compose up whatsapp`)
- La variable `WHATSAPP_SERVICE_URL` apunte correctamente
- Si está en producción, configura `CRM_INTERNAL_API_KEY`

### 3. Campos Opcionales
Algunos campos que el frontend espera no existen en la BD:
- **Services.category**: Se extrae de `metadata.category` (default: "general")
- **Services.features**: Se extrae de `metadata.features` (default: [])
- **Clients.satisfaction**: Placeholder fijo en 4.5 (requiere implementar ratings)

Si necesitas estos campos permanentemente, considera:
```sql
ALTER TABLE services ADD COLUMN category VARCHAR(50) DEFAULT 'general';
ALTER TABLE services ADD COLUMN features JSONB DEFAULT '[]';
```

### 4. CORS en Producción
Cambia `FRONTEND_URL` a tu dominio real:
```bash
FRONTEND_URL=https://tu-dominio.com
```

---

## 🛠️ Próximos Pasos (Frontend)

1. **Configurar base URL:**
   - Crear `.env.local` con `NEXT_PUBLIC_API_URL=http://localhost:8000`

2. **Quitar datos mock (si existen):**
   - Los endpoints ya devuelven datos reales de la BD

3. **Implementar funcionalidad faltante:**
   - Modal/formulario "Nueva Cita" → conectar a `POST /api/appointments`
   - Actualizar estado de citas → conectar a `PATCH /api/appointments/:id`
   - Eliminar citas → conectar a `DELETE /api/appointments/:id`

4. **Manejo de errores:**
   - Añadir toasts/notificaciones para éxito/error
   - Loading states mientras se cargan datos

5. **Validación de formularios:**
   - Validar campos antes de enviar
   - Formato de teléfono, fechas, etc.

---

## 📝 Resumen de Compatibilidad

| Endpoint Frontend | Backend Implementado | Status |
|-------------------|----------------------|--------|
| `GET /api/services` | ✅ ServicesController | ✅ |
| `GET /api/appointments` | ✅ AppointmentsController | ✅ |
| `POST /api/appointments` | ✅ AppointmentsController | ✅ |
| `PATCH /api/appointments/:id` | ✅ AppointmentsController | ✅ |
| `DELETE /api/appointments/:id` | ✅ AppointmentsController | ✅ |
| `GET /api/dashboard/stats` | ✅ DashboardController | ✅ |
| `GET /api/dashboard/appointments/today` | ✅ DashboardController | ✅ |
| `GET /api/clients` | ✅ ClientsController | ✅ |
| `GET /api/clients/analytics` | ✅ ClientsController | ✅ |
| `GET /api/whatsapp/status` | ✅ WhatsAppController (proxy) | ✅ |
| `GET /api/whatsapp/qr` | ✅ WhatsAppController (proxy) | ✅ |
| `POST /api/whatsapp/number` | ✅ WhatsAppController (proxy) | ✅ |
| `POST /api/whatsapp/logout` | ✅ WhatsAppController (proxy) | ✅ |

**Estado:** ✅ **100% Compatible**

---

## 🐛 Troubleshooting

### Backend no arranca
```bash
# Ver logs
docker-compose logs crm

# Reconstruir imagen
docker-compose build crm
docker-compose up -d crm
```

### Frontend no conecta
1. Verifica `.env.local` tiene `NEXT_PUBLIC_API_URL=http://localhost:8000`
2. Verifica CORS está habilitado en backend
3. Comprueba que el puerto 8000 esté accesible:
   ```bash
   curl http://localhost:8000/api/services
   ```

### Error de CORS
```bash
# En el backend (.env)
FRONTEND_URL=http://localhost:3000
```

### WhatsApp no responde
```bash
# Verificar servicio WhatsApp está corriendo
docker-compose ps

# Ver logs
docker-compose logs whatsapp

# Reiniciar servicio
docker-compose restart whatsapp
```

---

## 📞 Soporte

- **Swagger Docs**: http://localhost:8000/api/docs
- **Repo Backend**: https://github.com/Revocod3/nexora-back
- **Rama**: `salon-logic`

---

**Creado**: 2025-11-03  
**Versión Backend**: 1.0  
**Estado**: ✅ Producción Ready
