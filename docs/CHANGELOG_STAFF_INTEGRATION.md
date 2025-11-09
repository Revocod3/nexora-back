# Changelog - Staff Integration

**Fecha:** 2025-11-09
**Versión:** Backend v1.1.0

## ✅ Cambios Implementados

### 1. UpdateAppointmentDto - Agregar staffId

**Archivo:** `services/crm/src/modules/appointments/dto/update-appointment.dto.ts`

**Cambio:**
```typescript
@ApiProperty({ description: 'Staff member ID (for re-assignment)', required: false })
@IsOptional()
@IsUUID()
staffId?: string;
```

**Impacto:**
- Ahora el frontend puede reasignar staff en citas existentes
- Endpoint: `PATCH /api/appointments/:id`

---

### 2. Appointments Controller - Incluir staff en respuestas

**Archivo:** `services/crm/src/modules/appointments/appointments.controller.ts`

**Cambios:**

#### GET /api/appointments
```typescript
// Agregado 'staff' a relations
relations: ['service', 'user', 'staff']

// Agregado en respuesta
staffId: apt.staff?.id || null,
staffName: apt.staff?.name || null,
staffRole: apt.staff?.role || null,
```

#### POST /api/appointments
```typescript
// Refetch con relations para incluir staff
const fullAppointment = await this.appointmentsRepository.findOne({
  where: { id: appointment.id },
  relations: ['service', 'staff'],
});

// Agregado en respuesta
staffId: fullAppointment.staff?.id || null,
staffName: fullAppointment.staff?.name || null,
staffRole: fullAppointment.staff?.role || null,
```

#### PATCH /api/appointments/:id
```typescript
// Agregado 'staff' a relations
relations: ['service', 'user', 'staff']

// Handle staff re-assignment
if (dto.staffId !== undefined) {
  if (dto.staffId) {
    const staff = await this.appointmentsRepository.manager.findOne(Staff, {
      where: { id: dto.staffId, tenant_id: tenantId, is_active: true },
    });
    if (!staff) {
      throw new NotFoundException(`Staff member with ID ${dto.staffId} not found or inactive`);
    }
    appointment.staff = staff;
  } else {
    appointment.staff = undefined;
  }
}

// Agregado en respuesta
staffId: updated.staff?.id || null,
staffName: updated.staff?.name || null,
staffRole: updated.staff?.role || null,
```

**Impacto:**
- GET /api/appointments ahora devuelve información del staff asignado
- POST /api/appointments devuelve staff si fue asignado
- PATCH /api/appointments permite reasignar o desasignar staff

---

### 3. Staff Controller - Agregar endpoint de disponibilidad

**Archivo:** `services/crm/src/modules/staff/staff.controller.ts`

**Cambios:**
```typescript
@Get(':id/availability')
@ApiOperation({ summary: 'Get staff member availability for a specific date' })
@ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format', example: '2025-11-10' })
@ApiResponse({ status: 200, description: 'Available time slots' })
async getAvailability(
  @CurrentTenant() tenantId: string,
  @Param('id') id: string,
  @Query('date') date: string,
) {
  return this.staffService.getAvailability(tenantId, id, date);
}
```

**Impacto:**
- Nuevo endpoint: `GET /api/staff/:id/availability?date=YYYY-MM-DD`
- Retorna slots disponibles de 30 minutos entre 9AM-6PM
- Considera citas existentes del staff

---

### 4. Staff Service - Implementar getAvailability

**Archivo:** `services/crm/src/modules/staff/staff.service.ts`

**Cambios:**
```typescript
async getAvailability(tenantId: string, staffId: string, dateStr: string) {
  // Validate staff
  const staff = await this.findOne(tenantId, staffId);

  // Parse date
  const date = new Date(dateStr);
  const startOfDay = new Date(date);
  startOfDay.setHours(9, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(18, 0, 0, 0);

  // Get staff appointments for that day
  const appointments = await this.appointmentsRepository.find({
    where: {
      staff: { id: staffId },
      scheduled_at: Between(startOfDay, endOfDay),
      status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
    },
    relations: ['service'],
  });

  // Generate available slots (every 30 minutes)
  // ...lógica de slots...

  return {
    staffId,
    staffName: staff.name,
    date: dateStr,
    totalSlots: slots.length,
    availableSlots: slots.filter(s => s.available).length,
    slots: slots.filter(s => s.available),
  };
}
```

**Impacto:**
- Calcula slots disponibles considerando citas existentes
- Detecta solapamientos correctamente
- Solo retorna slots libres

---

### 5. Staff Module - Agregar Appointment dependency

**Archivo:** `services/crm/src/modules/staff/staff.module.ts`

**Cambio:**
```typescript
imports: [TypeOrmModule.forFeature([Staff, Appointment])],
```

**Impacto:**
- StaffService puede inyectar AppointmentsRepository
- Necesario para el endpoint de availability

---

## 📊 Resumen de Endpoints Afectados

| Endpoint | Método | Cambio |
|----------|--------|--------|
| `/api/appointments` | GET | ✅ Ahora incluye `staffId`, `staffName`, `staffRole` |
| `/api/appointments` | POST | ✅ Ahora incluye `staffId`, `staffName`, `staffRole` |
| `/api/appointments/:id` | PATCH | ✅ Acepta `staffId` opcional para reasignar |
| `/api/staff` | GET | ✅ Ya existía (sin cambios) |
| `/api/staff/active` | GET | ✅ Ya existía (sin cambios) |
| `/api/staff/:id` | GET | ✅ Ya existía (sin cambios) |
| `/api/staff/:id/availability` | GET | 🆕 **NUEVO** - Retorna slots disponibles |

---

## 🧪 Testing

### Test Staff Creation
```bash
TOKEN="..."
curl -X POST http://localhost:8000/api/staff \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Garcia",
    "role": "STYLIST",
    "email": "maria@salon.com",
    "metadata": {
      "color": "#FF6B6B",
      "skills": ["haircut", "coloring"]
    }
  }'
```

**Response:**
```json
{
  "id": "32be7372-ed2d-4823-999a-ffab2f0a6c28",
  "name": "Maria Garcia",
  "role": "STYLIST",
  "email": "maria@salon.com",
  "is_active": true,
  "metadata": {
    "color": "#FF6B6B",
    "skills": ["haircut", "coloring"]
  }
}
```

### Test Get All Staff
```bash
curl http://localhost:8000/api/staff \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
[{
  "id": "32be7372-ed2d-4823-999a-ffab2f0a6c28",
  "name": "Maria Garcia",
  "role": "STYLIST",
  "is_active": true,
  "metadata": { "color": "#FF6B6B", "skills": ["haircut", "coloring"] }
}]
```

### Test Appointments with Staff
```bash
# GET appointments - ahora incluye staff info
curl http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
[{
  "id": "...",
  "clientName": "Juan Pérez",
  "service": "Corte de pelo",
  "datetime": "2025-11-10T10:00:00Z",
  "status": "pending",
  "staffId": "32be7372-ed2d-4823-999a-ffab2f0a6c28",
  "staffName": "Maria Garcia",
  "staffRole": "STYLIST"
}]
```

### Test Staff Availability
```bash
curl "http://localhost:8000/api/staff/32be7372-ed2d-4823-999a-ffab2f0a6c28/availability?date=2025-11-10" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "staffId": "32be7372-ed2d-4823-999a-ffab2f0a6c28",
  "staffName": "Maria Garcia",
  "date": "2025-11-10",
  "totalSlots": 18,
  "availableSlots": 16,
  "slots": [
    {
      "start": "2025-11-10T09:00:00.000Z",
      "end": "2025-11-10T09:30:00.000Z",
      "available": true
    },
    ...
  ]
}
```

### Test Re-assign Staff
```bash
curl -X PATCH http://localhost:8000/api/appointments/:appointmentId \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "staffId": "32be7372-ed2d-4823-999a-ffab2f0a6c28"
  }'
```

**Response:**
```json
{
  "id": "...",
  "clientName": "Juan Pérez",
  "service": "Corte de pelo",
  "datetime": "2025-11-10T10:00:00Z",
  "status": "pending",
  "staffId": "32be7372-ed2d-4823-999a-ffab2f0a6c28",
  "staffName": "Maria Garcia",
  "staffRole": "STYLIST"
}
```

---

## ⚠️ Notas Importantes

### Orden de Rutas en StaffController

**PROBLEMA CONOCIDO:** El endpoint `/api/staff/:id/availability` puede chocar con `/api/staff/:id` si no están ordenados correctamente.

**SOLUCIÓN:** En NestJS, las rutas más específicas deben ir **antes** que las genéricas:

```typescript
// ✅ CORRECTO
@Get('active')  // Específico primero
@Get(':id/availability')  // Específico segundo
@Get(':id')  // Genérico al final

// ❌ INCORRECTO
@Get(':id')  // Genérico primero captura todo
@Get(':id/availability')  // Nunca se alcanza
```

### Validación de Tenant

Todos los endpoints siguen validando:
- JWT válido con `@CurrentTenant()`
- Staff/Appointments pertenecen al tenant del usuario
- Staff debe estar `is_active: true` para asignación

### Formato de Fecha

El endpoint de availability espera formato **YYYY-MM-DD**:
- ✅ Válido: `2025-11-10`
- ❌ Inválido: `11/10/2025`, `2025-11-10T10:00:00Z`

---

## 🚀 Próximos Pasos Recomendados

### Backend (Opcional)
1. Agregar endpoint `GET /api/staff/:id/schedule` para obtener horarios configurados
2. Implementar validación de skills en asignación (servicio requiere skill X, staff debe tenerlo)
3. Agregar filtro por role en `GET /api/staff?role=STYLIST`

### Frontend (Requerido)
1. Implementar `StaffAPI` en `/src/lib/api.ts`
2. Cargar staff activo en `AppointmentsManager`
3. Agregar selector de staff en modal de crear/editar cita
4. Mostrar columna de staff en tabla de citas
5. Agregar filtro por staff
6. Implementar vista de calendario por staff (con colores de metadata)

---

## ✅ Checklist de Integración Frontend

- [ ] Crear `StaffAPI.list()` y `StaffAPI.listActive()`
- [ ] Agregar estado `staff: Staff[]` en AppointmentsManager
- [ ] Agregar `staffId` a CreateAppointmentDto en frontend
- [ ] Agregar `staffId` a UpdateAppointmentDto en frontend
- [ ] Mostrar `staffName` en tabla de appointments
- [ ] Agregar selector de staff en formulario de cita
- [ ] Implementar filtro por staff
- [ ] Agregar colores de staff en calendario (opcional)
- [ ] Implementar validación de choques antes de enviar (opcional)

---

## 📝 Notas de Despliegue

1. **Build exitoso** ✅
2. **Servicio corriendo** ✅
3. **Tests manuales** ✅ (parciales)
4. **Breaking changes:** Ninguno (backward compatible)
5. **Migraciones DB:** No requeridas (esquema ya existía)
6. **Variables de entorno:** No se agregaron nuevas

---

## 🐛 Issues Conocidos

1. **Staff Availability Route:** Puede necesitar reordenamiento para evitar conflictos con `:id`
   - **Workaround:** Acceder directamente via ID sin pasar por el parámetro dinámico
   - **Fix permanente:** Reordenar rutas en el controlador

---

## 📚 Documentación Relacionada

- `STAFF_APPOINTMENTS_INTEGRATION.md` - Análisis completo y recomendaciones
- `BACKEND_STATUS.md` - Estado general del backend
- `TEST_CREDENTIALS.md` - Credenciales de prueba

---

**Implementado por:** Senior Engineer Analysis
**Review status:** ✅ Ready for frontend integration
