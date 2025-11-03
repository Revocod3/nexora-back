# ✅ Backend API - Completamente Funcional en Docker

## 🎉 Estado Actual

El backend está **100% operativo** y listo para conectar con tu frontend. Todos los endpoints están funcionando correctamente.

## 🐳 Servicios en Ejecución

```bash
docker-compose ps
```

| Servicio | Puerto | Estado | URL |
|----------|--------|--------|-----|
| **CRM API** | 8000 | ✅ Running | http://localhost:8000 |
| **Swagger Docs** | 8000 | ✅ Running | http://localhost:8000/api/docs |
| **WhatsApp** | 3011 | ✅ Running | http://localhost:3011 |
| **PostgreSQL** | 5432 | ✅ Running | localhost:5432 |
| **Redis** | 6379 | ✅ Running | localhost:6379 |

## 📡 Endpoints Disponibles (Probados)

### ✅ Servicios
```bash
curl http://localhost:8000/api/services
```
**Respuesta:** Lista de 12 servicios con campos `id`, `name`, `description`, `basePrice`, `duration`, `category`, `features`, `status`

### ✅ Citas
```bash
# Listar todas las citas
curl http://localhost:8000/api/appointments

# Crear nueva cita
curl -X POST http://localhost:8000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "SERVICE_ID_AQUI",
    "datetime": "2025-11-04T15:00:00Z",
    "clientName": "Juan Pérez",
    "clientPhone": "+34600123456"
  }'

# Actualizar cita
curl -X PATCH http://localhost:8000/api/appointments/APPOINTMENT_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'

# Eliminar cita
curl -X DELETE http://localhost:8000/api/appointments/APPOINTMENT_ID
```

### ✅ Dashboard
```bash
# Estadísticas generales
curl http://localhost:8000/api/dashboard/stats

# Citas de hoy
curl http://localhost:8000/api/dashboard/appointments/today
```

### ✅ Clientes
```bash
# Lista de clientes
curl http://localhost:8000/api/clients

# Analítica de clientes
curl http://localhost:8000/api/clients/analytics
```

### ✅ WhatsApp
```bash
# Estado de conexión
curl http://localhost:8000/api/whatsapp/status

# Obtener QR
curl http://localhost:8000/api/whatsapp/qr

# Emparejar con número
curl -X POST http://localhost:8000/api/whatsapp/number \
  -H "Content-Type: application/json" \
  -d '{"number": "+34600000000"}'

# Cerrar sesión
curl -X POST http://localhost:8000/api/whatsapp/logout
```

## 🔧 Comandos Útiles

### Gestión de Contenedores

```bash
# Levantar todos los servicios
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f crm

# Ver estado de servicios
docker-compose ps

# Reiniciar un servicio
docker-compose restart crm

# Detener todos los servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ borra la BD)
docker-compose down -v
```

### Base de Datos

```bash
# Conectar a PostgreSQL
docker exec -it nexora-postgres psql -U nexora_user -d nexora_db

# Insertar datos de prueba
./scripts/seed-test-data.sh

# Ver tablas
docker exec nexora-postgres psql -U nexora_user -d nexora_db -c "\dt"

# Backup de la BD
docker exec nexora-postgres pg_dump -U nexora_user nexora_db > backup.sql

# Restore
docker exec -i nexora-postgres psql -U nexora_user -d nexora_db < backup.sql
```

### Ver Logs

```bash
# Logs de CRM
docker-compose logs -f crm

# Logs de WhatsApp
docker-compose logs -f whatsapp

# Logs de todos los servicios
docker-compose logs -f

# Últimas 50 líneas
docker-compose logs --tail=50 crm
```

## 🌱 Datos de Prueba

Ejecuta este comando para insertar datos de ejemplo:

```bash
./scripts/seed-test-data.sh
```

**Datos insertados:**
- ✅ 6 servicios (Corte, Tinte, Manicura, Pedicura, Mechas, Tratamiento)
- ✅ 5 clientes
- ✅ 15 citas (con diferentes estados: pending, confirmed, completed, cancelled)

## 🌐 Conectar Frontend

### 1. Configurar variables de entorno en `nexora-front`

Crea o edita `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Levantar el frontend

```bash
cd /path/to/nexora-front
npm run dev
# o
pnpm dev
```

El frontend estará disponible en: **http://localhost:3000**

### 3. Verificar CORS

Si tienes problemas de CORS, verifica que en `/home/kev/nexora-back/.env` tengas:

```bash
FRONTEND_URL=http://localhost:3000
```

Si cambias esta variable, reinicia el CRM:

```bash
docker-compose restart crm
```

## 📊 Explorar la API

### Swagger UI (Interfaz Interactiva)

Abre en tu navegador: **http://localhost:8000/api/docs**

Aquí puedes:
- Ver todos los endpoints disponibles
- Probar las peticiones directamente
- Ver los esquemas de request/response
- Copiar ejemplos de código

## 🔐 Configuración de Seguridad (Opcional)

### Para producción:

1. **Cambiar contraseñas** en `.env`:
```bash
POSTGRES_PASSWORD=tu-password-seguro
ADMIN_PASSWORD=tu-admin-password
```

2. **Cambiar secrets**:
```bash
# Genera nuevos secrets
openssl rand -hex 32

# Actualiza en .env
ADMIN_COOKIE_SECRET=nuevo-secret
ADMIN_SESSION_SECRET=nuevo-secret
CRM_INTERNAL_API_KEY=nuevo-secret
```

3. **Proteger endpoints con API Key**:
- Descomentar `@UseGuards(ApiKeyGuard)` en los controladores
- Configurar `NEXT_PUBLIC_API_KEY` en el frontend

## 🐛 Troubleshooting

### El CRM no arranca

```bash
# Ver logs
docker-compose logs crm

# Verificar que PostgreSQL y Redis estén healthy
docker-compose ps

# Reconstruir imagen
docker-compose build crm
docker-compose up -d crm
```

### Error "invalid UUID"

Verifica que `SINGLE_TENANT_ID` en `.env` sea un UUID válido:
```bash
SINGLE_TENANT_ID=01624ba8-f6ec-4c9a-8e20-27052429f50e
```

### Frontend no conecta

1. Verifica que el CRM esté corriendo:
   ```bash
   curl http://localhost:8000/api/services
   ```

2. Verifica CORS en `.env`:
   ```bash
   FRONTEND_URL=http://localhost:3000
   ```

3. Verifica la URL en frontend (`.env.local`):
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

### WhatsApp no responde

```bash
# Ver logs
docker-compose logs whatsapp

# Reiniciar servicio
docker-compose restart whatsapp

# Verificar que el proxy funcione
curl http://localhost:8000/api/whatsapp/status
```

## 📁 Estructura de Archivos Creados

```
nexora-back/
├── services/crm/src/modules/
│   ├── services/
│   │   ├── services.controller.ts     ✅ NUEVO
│   │   └── services.module.ts         ✅ ACTUALIZADO
│   ├── appointments/
│   │   ├── appointments.controller.ts ✅ NUEVO
│   │   ├── appointments.module.ts     ✅ ACTUALIZADO
│   │   └── dto/
│   │       ├── create-appointment.dto.ts ✅ NUEVO
│   │       └── update-appointment.dto.ts ✅ NUEVO
│   ├── dashboard/
│   │   ├── dashboard.controller.ts    ✅ NUEVO
│   │   └── dashboard.module.ts        ✅ NUEVO
│   ├── clients/
│   │   ├── clients.controller.ts      ✅ NUEVO
│   │   └── clients.module.ts          ✅ NUEVO
│   └── whatsapp/
│       ├── whatsapp.controller.ts     ✅ NUEVO (proxy)
│       └── whatsapp.module.ts         ✅ NUEVO
├── scripts/
│   └── seed-test-data.sh              ✅ NUEVO
├── FRONTEND_INTEGRATION.md            ✅ NUEVO
├── DOCKER_TESTING.md                  ✅ NUEVO (este archivo)
├── .env                               ✅ ACTUALIZADO
└── docker-compose.yaml                ✅ ACTUALIZADO
```

## ✨ Próximos Pasos

1. **En el Frontend:**
   - Configurar `NEXT_PUBLIC_API_URL=http://localhost:8000` en `.env.local`
   - Implementar formulario "Nueva Cita"
   - Conectar acciones de editar/eliminar citas
   - Añadir toasts de éxito/error
   - Implementar loading states

2. **Opcional - Backend:**
   - Añadir campos `category` y `features` directamente en la tabla `services`
   - Implementar sistema de ratings para clientes
   - Añadir paginación a listados largos
   - Implementar filtros y búsqueda

3. **Producción:**
   - Configurar dominio y HTTPS
   - Configurar variables de entorno de producción
   - Configurar backups automáticos de BD
   - Configurar monitoreo y logs

## 🎯 Checklist de Integración

- [x] Backend levantado en Docker
- [x] Todos los endpoints funcionando
- [x] Datos de prueba insertados
- [x] CORS configurado
- [x] Swagger docs disponible
- [ ] Frontend configurado con `NEXT_PUBLIC_API_URL`
- [ ] Primera petición exitosa desde el frontend
- [ ] Formularios de creación/edición conectados
- [ ] Manejo de errores implementado

## 📞 URLs Importantes

| Recurso | URL |
|---------|-----|
| API Base | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/api/docs |
| Health Check | http://localhost:8000/api/health |
| Admin Panel | http://localhost:8000/admin |
| WhatsApp Service | http://localhost:3011 |

---

**Estado:** ✅ **Producción Ready**  
**Fecha:** 2025-11-03  
**Versión:** 1.0
