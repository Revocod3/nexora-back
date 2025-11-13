# Staff & Appointments Integration - Backend Analysis

**Fecha:** 2025-11-09
**Revisado por:** Senior Engineer Analysis

---

## Respuestas a tus Preguntas

### 1. ¿El backend dispone de `/api/staff` y algún endpoint de disponibilidad?

✅ **SÍ** - El backend tiene un módulo completo de Staff con los siguientes endpoints:

#### Endpoints Disponibles

```typescript
GET    /api/staff              // Lista todo el staff del tenant
GET    /api/staff/active       // Lista solo staff activo
GET    /api/staff/:id          // Obtiene un staff específico
POST   /api/staff              // Crear nuevo staff
PUT    /api/staff/:id          // Actualizar staff
PATCH  /api/staff/:id/deactivate  // Desactivar staff
DELETE /api/staff/:id          // Eliminar staff
```

#### Estructura de Staff

```typescript
{
  id: string;                   // UUID
  name: string;
  email?: string;
  phone?: string;
  role: StaffRole;              // STYLIST | BARBER | COLORIST | MANICURIST | ESTHETICIAN | MASSEUR | OTHER
  is_active: boolean;
  availability?: Record<string, any>;  // Horarios por día de semana
  metadata?: Record<string, any>;      // Color, foto, bio, especialidades, etc.
  created_at: Date;
  updated_at: Date;
}
```

#### Endpoint de Disponibilidad

❌ **NO EXISTE** actualmente un endpoint dedicado como `/api/staff/:id/availability?date=YYYY-MM-DD`

**Pero:**
- La entidad `Staff` tiene un campo `availability` (jsonb) para almacenar horarios
- El `AppointmentsService` ya tiene lógica de validación de disponibilidad en `checkSlotAvailability()`
- **RECOMENDACIÓN**: Agregar endpoint `GET /api/staff/:id/availability` que retorne slots disponibles

---

### 2. ¿Queréis permitir re-asignación de staff en edición de cita?

❌ **NO actualmente** - El `UpdateAppointmentDto` NO incluye `staffId`

#### Estado Actual

**CreateAppointmentDto** (✅ soporta staffId):
```typescript
{
  serviceId: string;     // ✅ Required
  staffId?: string;      // ✅ Optional
  datetime: string;
  clientName?: string;
  clientPhone?: string;
  userId?: string;
  notes?: string;
}
```

**UpdateAppointmentDto** (❌ NO soporta staffId):
```typescript
{
  datetime?: string;
  clientName?: string;
  clientPhone?: string;
  status?: AppointmentStatus;
  notes?: string;
  cancellationReason?: string;
  // ❌ NO HAY staffId aquí
}
```

#### Recomendación

**AGREGAR** `staffId` al `UpdateAppointmentDto`:

```typescript
// services/crm/src/modules/appointments/dto/update-appointment.dto.ts
export class UpdateAppointmentDto {
  // ... campos existentes ...

  @ApiProperty({ description: 'Staff member ID', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
```

Y actualizar el controlador para procesarlo:

```typescript
// services/crm/src/modules/appointments/appointments.controller.ts
async updateAppointment(...) {
  // ...
  if (dto.staffId) {
    const staff = await this.staffRepository.findOne({
      where: { id: dto.staffId, tenant: { id: tenantId }, is_active: true }
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    appointment.staff = staff;
  }
  // ...
}
```

---

### 3. ¿Tenéis relación servicios↔staff en backend para filtrar servicios por habilidades?

❌ **NO** - Actualmente no hay relación directa entre `Service` y `Staff`

#### Estado Actual

**Service entity:**
```typescript
{
  id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  currency: string;
  status: ServiceStatus;
  metadata?: Record<string, any>;  // 👈 Se podría usar para "required_skills"
}
```

**Staff entity:**
```typescript
{
  id: string;
  name: string;
  role: StaffRole;  // 👈 Rol general (STYLIST, BARBER, etc)
  metadata?: Record<string, any>;  // 👈 Se podría usar para "skills": ["haircut", "coloring"]
}
```

**Appointment entity:**
```typescript
{
  id: string;
  service: Service;    // ✅ Relación con servicio
  staff?: Staff;       // ✅ Relación con staff (opcional)
  // ... otros campos
}
```

#### Opciones de Implementación

**Opción A: Usar campos `metadata` existentes (más rápido)**

```typescript
// Service
metadata: {
  required_skills: ["haircut", "styling"],
  required_role: "STYLIST"
}

// Staff
metadata: {
  skills: ["haircut", "styling", "coloring"],
  specialties: ["balayage", "keratin"]
}
```

**Opción B: Crear tabla de relación many-to-many (más robusto)**

```sql
CREATE TABLE service_staff (
  service_id UUID REFERENCES services(id),
  staff_id UUID REFERENCES staff(id),
  PRIMARY KEY (service_id, staff_id)
);
```

**RECOMENDACIÓN:** Empezar con Opción A (metadata) por rapidez, migrar a Opción B si crece la complejidad.

---

### 4. ¿Hay roles (admin/staff) y restricciones de vista/acción?

✅ **SÍ** - Hay sistema de roles implementado

#### Roles Disponibles

**TenantUser (usuarios del panel):**
```typescript
enum TenantUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER'
}
```

**Staff (empleados del salón):**
```typescript
enum StaffRole {
  STYLIST = 'STYLIST',
  BARBER = 'BARBER',
  COLORIST = 'COLORIST',
  MANICURIST = 'MANICURIST',
  ESTHETICIAN = 'ESTHETICIAN',
  MASSEUR = 'MASSEUR',
  OTHER = 'OTHER'
}
```

#### JWT Payload

```typescript
{
  sub: string;           // userId (TenantUser.id)
  email: string;
  tenantId: string;
  role: TenantUserRole;  // 👈 OWNER | ADMIN | MANAGER
  iat: number;
  exp: number;
}
```

#### Endpoint `/api/auth/me`

✅ **FUNCIONA** y devuelve el rol:

```typescript
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "user": {
    "id": "...",
    "email": "test@demo.com",
    "role": "OWNER"  // 👈 OWNER | ADMIN | MANAGER
  },
  "tenant": {
    "id": "...",
    "name": "Salon Demo",
    "email": "contact@demo.com",
    "subdomain": "demo",
    "whatsapp_number": null,
    "status": "active"
  }
}
```

#### Restricciones por Rol (Recomendaciones)

**Frontend debe implementar:**

| Rol | Permisos |
|-----|----------|
| **OWNER** | ✅ Todo (crear/editar/eliminar staff, servicios, citas, configuración) |
| **ADMIN** | ✅ Gestión completa de citas y clientes<br>✅ Crear/editar servicios<br>❌ No puede eliminar staff ni cambiar configuración del tenant |
| **MANAGER** | ✅ Ver y gestionar citas<br>✅ Ver clientes y servicios<br>❌ No puede crear/editar servicios ni staff |

**Backend:**
- Actualmente NO hay guards específicos por rol más allá de `JwtAuthGuard`
- Todos los endpoints requieren JWT válido
- **RECOMENDACIÓN**: Agregar `@Roles()` decorator y `RolesGuard` para endpoints críticos

---

## Estado Actual del Backend

### ✅ Lo que YA está implementado

1. **Staff Module completo**
   - CRUD de staff con tenant isolation
   - Campo `availability` para horarios
   - Campo `metadata` para datos adicionales (color, foto, skills)
   - Roles de staff (STYLIST, BARBER, etc.)

2. **Appointments con Staff**
   - `CreateAppointmentDto` acepta `staffId` opcional
   - Validación de disponibilidad considera staff específico
   - Relación `Appointment -> Staff` (ManyToOne)
   - Prevención de solapamientos por staff

3. **Autenticación y Roles**
   - JWT con roles (OWNER, ADMIN, MANAGER)
   - Endpoint `/api/auth/me` devuelve user y tenant con rol
   - Tenant isolation en todos los endpoints

4. **Servicios**
   - CRUD completo con tenant isolation
   - Campos: duration_minutes, price, status
   - Campo `metadata` para datos adicionales

### ❌ Lo que FALTA implementar

1. **Re-asignación de staff en edición**
   - Agregar `staffId` a `UpdateAppointmentDto`
   - Validar disponibilidad al reasignar

2. **Endpoint de disponibilidad por staff**
   - `GET /api/staff/:id/availability?date=YYYY-MM-DD`
   - Retornar slots disponibles considerando citas existentes

3. **Relación servicios ↔ staff**
   - Opción A: Usar `metadata` en ambas entidades
   - Opción B: Tabla de relación many-to-many

4. **Guards por rol**
   - `@Roles()` decorator
   - `RolesGuard` para proteger endpoints sensibles
   - Ejemplo: solo OWNER puede eliminar staff

5. **Incluir staff en respuesta de appointments**
   - Actualmente `GET /api/appointments` NO incluye info de staff
   - Agregar relación `staff` en el query

---

## Cambios Recomendados en el Backend

### 1. Agregar `staffId` a UpdateAppointmentDto

**Archivo:** `services/crm/src/modules/appointments/dto/update-appointment.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { AppointmentStatus } from '../../../entities/appointment.entity';

export class UpdateAppointmentDto {
  @ApiProperty({ description: 'New scheduled date and time (ISO 8601)', required: false })
  @IsOptional()
  @IsDateString()
  datetime?: string;

  @ApiProperty({ description: 'Client name', required: false })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiProperty({ description: 'Client phone', required: false })
  @IsOptional()
  @IsString()
  clientPhone?: string;

  @ApiProperty({ description: 'Appointment status', required: false, enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Cancellation reason', required: false })
  @IsOptional()
  @IsString()
  cancellationReason?: string;

  // 👇 NUEVO
  @ApiProperty({ description: 'Staff member ID', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
```

### 2. Actualizar AppointmentsController.updateAppointment()

**Archivo:** `services/crm/src/modules/appointments/appointments.controller.ts`

```typescript
@Patch(':id')
async updateAppointment(
  @CurrentTenant() tenantId: string,
  @Param('id') id: string,
  @Body() dto: UpdateAppointmentDto
) {
  const appointment = await this.appointmentsRepository.findOne({
    where: { id, tenant: { id: tenantId } },
    relations: ['service', 'user', 'staff'],  // 👈 Agregar 'staff'
  });

  if (!appointment) {
    throw new NotFoundException(`Appointment with ID ${id} not found`);
  }

  // Update fields
  if (dto.datetime) {
    appointment.scheduled_at = new Date(dto.datetime);
  }
  if (dto.clientName) {
    appointment.customer_name = dto.clientName;
  }
  if (dto.clientPhone) {
    appointment.customer_phone = dto.clientPhone;
  }
  if (dto.status) {
    appointment.status = dto.status;
  }
  if (dto.notes) {
    appointment.notes = dto.notes;
  }
  if (dto.cancellationReason) {
    appointment.cancellation_reason = dto.cancellationReason;
  }

  // 👇 NUEVO: Re-asignar staff
  if (dto.staffId !== undefined) {
    if (dto.staffId) {
      const staff = await this.staffRepository.findOne({
        where: { id: dto.staffId, tenant_id: tenantId, is_active: true }
      });
      if (!staff) {
        throw new NotFoundException(`Staff member with ID ${dto.staffId} not found`);
      }
      appointment.staff = staff;
    } else {
      // Si staffId es null/undefined, desasignar staff
      appointment.staff = null;
    }
  }

  const updated = await this.appointmentsRepository.save(appointment);

  return {
    id: updated.id,
    clientName: updated.customer_name || updated.user?.name || '',
    clientPhone: updated.customer_phone || updated.user?.phone_e164 || '',
    service: updated.service?.name || 'Unknown',
    datetime: updated.scheduled_at.toISOString(),
    status: updated.status,
    duration: updated.service?.duration_minutes || 0,
    price: updated.service ? Number(updated.service.price) : 0,
    notes: updated.notes || '',
    staffId: updated.staff?.id || null,  // 👈 NUEVO
    staffName: updated.staff?.name || null,  // 👈 NUEVO
  };
}
```

### 3. Incluir staff en GET /api/appointments

**Archivo:** `services/crm/src/modules/appointments/appointments.controller.ts`

```typescript
@Get()
async getAppointments(@CurrentTenant() tenantId: string) {
  const appointments = await this.appointmentsRepository.find({
    where: { tenant: { id: tenantId } },
    relations: ['service', 'user', 'staff'],  // 👈 Agregar 'staff'
    order: { scheduled_at: 'DESC' },
  });

  return appointments.map((apt) => ({
    id: apt.id,
    clientName: apt.customer_name || apt.user?.name || 'N/A',
    clientPhone: apt.customer_phone || apt.user?.phone_e164 || '',
    service: apt.service?.name || 'Unknown',
    datetime: apt.scheduled_at.toISOString(),
    status: apt.status,
    duration: apt.service?.duration_minutes || 0,
    price: apt.service ? Number(apt.service.price) : 0,
    notes: apt.notes || '',
    staffId: apt.staff?.id || null,  // 👈 NUEVO
    staffName: apt.staff?.name || null,  // 👈 NUEVO
    staffRole: apt.staff?.role || null,  // 👈 NUEVO (opcional)
  }));
}
```

### 4. Agregar endpoint de disponibilidad de staff

**Archivo:** `services/crm/src/modules/staff/staff.controller.ts`

```typescript
@Get(':id/availability')
async getAvailability(
  @CurrentTenant() tenantId: string,
  @Param('id') staffId: string,
  @Query('date') date: string,  // YYYY-MM-DD
) {
  return this.staffService.getAvailability(tenantId, staffId, date);
}
```

**Archivo:** `services/crm/src/modules/staff/staff.service.ts`

```typescript
async getAvailability(tenantId: string, staffId: string, dateStr: string) {
  // Validar staff
  const staff = await this.findOne(tenantId, staffId);

  // Parse date
  const date = new Date(dateStr);
  const startOfDay = new Date(date);
  startOfDay.setHours(9, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(18, 0, 0, 0);

  // Obtener citas del staff para ese día
  const appointments = await this.appointmentsRepository.find({
    where: {
      staff: { id: staffId },
      scheduled_at: Between(startOfDay, endOfDay),
      status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
    },
    relations: ['service'],
  });

  // Generar slots disponibles (cada 30min)
  const slots = [];
  let currentTime = new Date(startOfDay);

  while (currentTime < endOfDay) {
    const slotEnd = new Date(currentTime);
    slotEnd.setMinutes(slotEnd.getMinutes() + 30);

    if (slotEnd <= endOfDay) {
      const isOccupied = appointments.some((apt) => {
        const aptStart = new Date(apt.scheduled_at);
        const aptEnd = new Date(aptStart);
        aptEnd.setMinutes(aptEnd.getMinutes() + apt.service.duration_minutes);

        return (
          (currentTime >= aptStart && currentTime < aptEnd) ||
          (slotEnd > aptStart && slotEnd <= aptEnd) ||
          (currentTime <= aptStart && slotEnd >= aptEnd)
        );
      });

      slots.push({
        start: currentTime.toISOString(),
        end: slotEnd.toISOString(),
        available: !isOccupied,
      });
    }

    currentTime.setMinutes(currentTime.getMinutes() + 30);
  }

  return {
    staffId,
    staffName: staff.name,
    date: dateStr,
    slots: slots.filter(s => s.available),
  };
}
```

### 5. Agregar color a metadata de staff

El campo `metadata` ya existe, solo necesitas poblarlo:

```typescript
POST /api/staff
{
  "name": "Maria García",
  "role": "STYLIST",
  "email": "maria@salon.com",
  "phone": "+34600123456",
  "metadata": {
    "color": "#FF6B6B",        // 👈 Color para el calendario
    "photo_url": "https://...",
    "bio": "Especialista en balayage",
    "skills": ["haircut", "coloring", "styling"]
  }
}
```

---

## Cambios Recomendados en el Frontend

### 1. Agregar StaffAPI en `src/lib/api.ts`

```typescript
export const StaffAPI = {
  list: () => request<Staff[]>('/api/staff'),

  listActive: () => request<Staff[]>('/api/staff/active'),

  getOne: (id: string) => request<Staff>(`/api/staff/${id}`),

  create: (data: CreateStaffDto) =>
    request<Staff>('/api/staff', { method: 'POST', body: data }),

  update: (id: string, data: UpdateStaffDto) =>
    request<Staff>(`/api/staff/${id}`, { method: 'PUT', body: data }),

  deactivate: (id: string) =>
    request<Staff>(`/api/staff/${id}/deactivate`, { method: 'PATCH' }),

  delete: (id: string) =>
    request<void>(`/api/staff/${id}`, { method: 'DELETE' }),

  // NUEVO: cuando se implemente en backend
  getAvailability: (id: string, date: string) =>
    request<AvailabilityResponse>(`/api/staff/${id}/availability?date=${date}`),
};

interface Staff {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: StaffRole;
  is_active: boolean;
  metadata?: {
    color?: string;
    photo_url?: string;
    bio?: string;
    skills?: string[];
  };
}

type StaffRole = 'STYLIST' | 'BARBER' | 'COLORIST' | 'MANICURIST' | 'ESTHETICIAN' | 'MASSEUR' | 'OTHER';
```

### 2. Actualizar AppointmentsAPI para incluir staffId

```typescript
export const AppointmentsAPI = {
  list: () => request<Appointment[]>('/api/appointments'),

  create: (data: {
    serviceId: string;
    datetime: string;
    clientName?: string;
    clientPhone?: string;
    staffId?: string;  // 👈 Agregar
    notes?: string;
  }) => request<Appointment>('/api/appointments', {
    method: 'POST',
    body: data,
  }),

  update: (id: string, data: {
    datetime?: string;
    clientName?: string;
    clientPhone?: string;
    status?: AppointmentStatus;
    notes?: string;
    staffId?: string;  // 👈 Agregar (cuando backend lo soporte)
  }) => request<Appointment>(`/api/appointments/${id}`, {
    method: 'PATCH',
    body: data,
  }),

  delete: (id: string) =>
    request<void>(`/api/appointments/${id}`, { method: 'DELETE' }),
};
```

### 3. Actualizar interfaz Appointment

```typescript
interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  service: string;
  datetime: string;
  status: AppointmentStatus;
  duration: number;
  price: number;
  notes: string;
  staffId?: string;      // 👈 Agregar
  staffName?: string;    // 👈 Agregar
  staffRole?: StaffRole; // 👈 Agregar (opcional)
}
```

### 4. Actualizar AppointmentsManager

```typescript
// src/components/appointments/AppointmentsManager.tsx

export function AppointmentsManager({ initialAppointments }: Props) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  useEffect(() => {
    // Cargar staff activo
    StaffAPI.listActive().then(setStaff);
  }, []);

  // Filtrar por staff
  const filteredAppointments = selectedStaffId
    ? appointments.filter(apt => apt.staffId === selectedStaffId)
    : appointments;

  // En el modal de crear/editar
  const handleSubmit = async (data) => {
    const payload = {
      ...data,
      staffId: selectedStaffForAppointment,  // Del selector
    };

    if (editingId) {
      await AppointmentsAPI.update(editingId, payload);
    } else {
      await AppointmentsAPI.create(payload);
    }

    // Refrescar lista
    const updated = await AppointmentsAPI.list();
    setAppointments(updated);
  };

  return (
    <div>
      {/* Filtro de staff */}
      <select onChange={(e) => setSelectedStaffId(e.target.value || null)}>
        <option value="">Todos los profesionales</option>
        {staff.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Tabla con columna de staff */}
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Servicio</th>
            <th>Fecha/Hora</th>
            <th>Profesional</th>  {/* 👈 NUEVA */}
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredAppointments.map(apt => (
            <tr key={apt.id}>
              <td>{apt.clientName}</td>
              <td>{apt.service}</td>
              <td>{formatDateTime(apt.datetime)}</td>
              <td>
                <span style={{ color: getStaffColor(apt.staffId) }}>
                  {apt.staffName || 'Sin asignar'}
                </span>
              </td>
              <td>{apt.status}</td>
              <td>...</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Prioridad de Implementación

### Alta Prioridad (hacer primero)

1. ✅ **Incluir staff en respuesta de appointments** (5 min)
   - Solo agregar `'staff'` a relations y mapear en respuesta

2. ✅ **Agregar `staffId` a UpdateAppointmentDto** (15 min)
   - Permite re-asignación desde el frontend

3. ✅ **Frontend: Cargar y mostrar staff** (30 min)
   - `StaffAPI.listActive()`
   - Selector en modal de crear/editar
   - Columna en tabla de citas

### Media Prioridad (siguiente sprint)

4. **Endpoint de disponibilidad de staff** (1 hora)
   - `GET /api/staff/:id/availability?date=YYYY-MM-DD`
   - Permite ver calendario por profesional

5. **Validación de choques por staff** (30 min)
   - Frontend valida antes de enviar
   - Toast de error si hay choque

6. **Filtros y vista de calendario por staff** (2 horas)
   - Filtro por staff en appointments
   - Vista de calendario coloreada por profesional

### Baja Prioridad (backlog)

7. **Relación servicios ↔ staff** (2-4 horas)
   - Implementar con metadata o tabla relacional
   - Filtrar servicios por skills del staff

8. **Guards por rol** (2 horas)
   - `@Roles()` decorator
   - `RolesGuard`
   - Proteger endpoints sensibles

9. **Restricciones por rol en frontend** (1 hora)
   - Mostrar/ocultar acciones según rol del user
   - Deshabilitar botones para MANAGER

---

## Testing

### Probar /api/staff desde frontend

```typescript
// Test básico
const staff = await StaffAPI.listActive();
console.log('Staff activo:', staff);

// Crear cita con staff
const appointment = await AppointmentsAPI.create({
  serviceId: 'service-uuid',
  staffId: 'staff-uuid',  // 👈
  datetime: '2025-11-10T10:00:00Z',
  clientName: 'Juan Pérez',
  clientPhone: '+34600123456'
});
```

### Probar roles

```typescript
// En tu app
const { user } = await AuthAPI.me();
console.log('User role:', user.role);  // OWNER | ADMIN | MANAGER

if (user.role === 'OWNER') {
  // Mostrar botones de eliminar staff
}
```

---

## Resumen Final

| Feature | Backend | Frontend | Prioridad |
|---------|---------|----------|-----------|
| Endpoints /api/staff | ✅ Listo | ❌ Falta integrar | **Alta** |
| staffId en CreateAppointment | ✅ Listo | ❌ Falta enviar | **Alta** |
| staffId en UpdateAppointment | ❌ Falta agregar | ❌ Falta integrar | **Alta** |
| Staff en respuesta appointments | ❌ Falta incluir | ❌ Falta mostrar | **Alta** |
| Endpoint availability | ❌ No existe | ❌ No existe | Media |
| Relación servicios↔staff | ❌ No existe | ❌ No existe | Baja |
| Roles en JWT | ✅ Listo | ❌ Falta usar | Media |
| Guards por rol | ❌ No implementado | N/A | Baja |

**Esfuerzo estimado para MVP:**
- Backend: 1-2 horas
- Frontend: 3-4 horas
- **Total: ~5 horas**
