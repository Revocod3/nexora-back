# Arquitectura Multi-Tenant - Nexora

## Tabla de Contenidos
- [Entidades del Sistema](#entidades-del-sistema)
- [Caso de Uso 1: Salón con Múltiples Estilistas](#caso-de-uso-1-salón-con-múltiples-estilistas)
- [Caso de Uso 2: Barbero Independiente](#caso-de-uso-2-barbero-independiente)
- [Diagrama de Relaciones](#diagrama-de-relaciones)
- [Seguridad y Aislamiento](#seguridad-y-aislamiento)
- [API Endpoints por Rol](#api-endpoints-por-rol)

---

## Entidades del Sistema

### 1. **Tenant** (El Negocio)
```typescript
Tenant {
  id: uuid
  name: "Salón Belleza Madrid"
  email: "contacto@salonmadrid.com"
  subdomain: "salonmadrid"
  whatsapp_number: "+34612345678"
  status: ACTIVE | INACTIVE
  metadata: jsonb
  created_at: timestamp
  updated_at: timestamp
}
```

**Propósito:**
- Representa un negocio completo (salon, barbería, spa, etc.)
- Es el contenedor de todos los datos
- Cada tenant es completamente aislado de los demás

---

### 2. **TenantUser** (Administrador del Negocio)
```typescript
TenantUser {
  id: uuid
  tenant_id: uuid              // ← Pertenece a UN tenant
  name: "Juan Pérez"
  email: "juan@salonmadrid.com"
  password_hash: string        // ← Contraseña hasheada con bcrypt
  role: OWNER | ADMIN | MANAGER
  is_active: boolean
  last_login_at: timestamp
}
```

**Propósito:**
- Persona que **administra el negocio**
- Se loguea al dashboard web del CRM
- Gestiona appointments, servicios, staff, clientes
- Tiene credenciales de acceso (email + password)

**Roles:**
- `OWNER`: Dueño del negocio (acceso completo)
- `ADMIN`: Administrador (casi todos los permisos)
- `MANAGER`: Gerente (permisos limitados)

---

### 3. **Staff** (Empleados/Prestadores de Servicio)
```typescript
Staff {
  id: uuid
  tenant_id: uuid              // ← Pertenecen a UN tenant
  name: "María López"
  email: "maria@salonmadrid.com"
  phone: "+34666111222"
  role: STYLIST | BARBER | COLORIST | MANICURIST | ESTHETICIAN | MASSEUR | OTHER
  is_active: boolean
  availability: jsonb          // Horarios disponibles
  metadata: jsonb              // Especialidades, años experiencia, etc.
}
```

**Propósito:**
- Empleados que **prestan los servicios**
- Los clientes pueden solicitar cita con un staff específico
- NO tienen login al sistema (por ahora)

**Roles de Staff:**
- `STYLIST`: Estilista
- `BARBER`: Barbero
- `COLORIST`: Colorista
- `MANICURIST`: Manicurista
- `ESTHETICIAN`: Esteticista
- `MASSEUR`: Masajista
- `OTHER`: Otro rol personalizado

---

### 4. **User** (Clientes Finales)
```typescript
User {
  id: uuid
  tenant_id: uuid              // ← Cliente de UN tenant específico
  name: "Ana García"
  phone_e164: "+34666777888"
  email: "ana@gmail.com"
  status: ACTIVE | INACTIVE | BLOCKED
  metadata: jsonb
}
```

**Propósito:**
- Los **clientes finales** que solicitan servicios
- Se crean automáticamente cuando escriben por WhatsApp
- NO tienen login (son clientes, no administradores)

---

### 5. **Appointment** (Cita)
```typescript
Appointment {
  id: uuid
  tenant_id: uuid              // ← A qué negocio pertenece
  user_id: uuid | null         // ← Cliente (puede ser null si es guest)
  staff_id: uuid | null        // ← Quién presta el servicio
  service_id: uuid             // ← Qué servicio se presta
  scheduled_at: timestamp
  status: PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW

  // Campos para "guest appointments" (sin User registrado)
  customer_name: string
  customer_phone: string

  notes: string
  cancellation_reason: string
  completed_at: timestamp
}
```

---

## Caso de Uso 1: Salón con Múltiples Estilistas

**Ejemplo:** "Salón Belleza Madrid" tiene 3 estilistas que atienden clientes.

### Entidades Creadas:

```
┌─────────────────────────────────────────┐
│         TENANT                          │
│   "Salón Belleza Madrid"                │
│   whatsapp: +34612345678                │
└──────────┬──────────────────────────────┘
           │
           ├─── TenantUser (Administradores)
           │    ├─ Juan Pérez (OWNER) ──────────► Administra todo el salon
           │    └─ Carmen Silva (ADMIN) ─────────► Gestiona appointments
           │
           ├─── Staff (Empleados)
           │    ├─ María López (STYLIST) ────────► Cortes y peinados
           │    ├─ Pedro Gómez (BARBER) ─────────► Cortes masculinos
           │    └─ Laura Ruiz (COLORIST) ────────► Tintes y mechas
           │
           └─── Users (Clientes)
                ├─ Ana García (+34666777888)
                ├─ Carlos Díaz (+34666888999)
                └─ Isabel Torres (+34666999000)
```

---

### Flujo Completo: Desde Signup hasta Cita Atendida

#### **Paso 1: Juan crea el salon**
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "tenantName": "Salón Belleza Madrid",
  "email": "juan@salonmadrid.com",
  "password": "SecurePass123!",
  "ownerName": "Juan Pérez",
  "subdomain": "salonmadrid",
  "whatsappNumber": "+34612345678"
}

# Respuesta:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-juan",
    "email": "juan@salonmadrid.com",
    "tenantId": "uuid-tenant-madrid",
    "role": "OWNER"
  }
}
```

**¿Qué se creó?**
- ✅ **Tenant**: Salón Belleza Madrid
- ✅ **TenantUser**: Juan Pérez (OWNER)
- ✅ **JWT**: Token con `{ tenantId: "uuid-tenant-madrid", userId: "uuid-juan" }`

---

#### **Paso 2: Juan se loguea al dashboard**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "juan@salonmadrid.com",
  "password": "SecurePass123!"
}

# Respuesta: Mismo JWT
```

Juan abre el dashboard web → El frontend guarda el JWT en localStorage.

---

#### **Paso 3: Juan agrega los servicios del salon**
```bash
POST /api/services
Authorization: Bearer <jwt-de-juan>
Content-Type: application/json

{
  "name": "Corte de Pelo",
  "description": "Corte profesional para todo tipo de cabello",
  "price": 25.00,
  "duration_minutes": 45,
  "currency": "EUR",
  "category": "haircut",
  "status": "ACTIVE"
}

# Se repite para: "Tinte Completo", "Barba y Bigote", etc.
```

**¿Cómo funciona?**
- El `@CurrentTenant()` decorator extrae `tenantId` del JWT
- Los servicios se crean automáticamente asociados a "Salón Belleza Madrid"

---

#### **Paso 4: Juan agrega a su equipo de staff**
```bash
# Agregar a María (estilista)
POST /api/staff
Authorization: Bearer <jwt-de-juan>
Content-Type: application/json

{
  "name": "María López",
  "role": "STYLIST",
  "email": "maria@salonmadrid.com",
  "phone": "+34666111222",
  "availability": {
    "monday": ["09:00-14:00", "16:00-20:00"],
    "tuesday": ["09:00-14:00", "16:00-20:00"],
    "wednesday": ["09:00-14:00"],
    "thursday": ["09:00-14:00", "16:00-20:00"],
    "friday": ["09:00-14:00", "16:00-20:00"],
    "saturday": ["10:00-14:00"]
  }
}

# Se repite para Pedro (BARBER) y Laura (COLORIST)
```

---

#### **Paso 5: Cliente Ana escribe por WhatsApp**
```
📱 WhatsApp: +34612345678 (número del salon)

Ana: "Hola, quiero pedir cita para un corte de pelo"
```

**Flujo interno:**
1. **WhatsApp Service** recibe el mensaje
2. Busca si existe User con phone `+34666777888` para tenant Madrid
3. Si no existe, lo crea:
```bash
POST /api/internal/upsert_user
x-api-key: <internal-key>
Content-Type: application/json

{
  "phone_e164": "+34666777888",
  "name": "Ana García",  # Extraído del contacto de WhatsApp
  "tenantId": "uuid-tenant-madrid"
}
```

---

#### **Paso 6: Agent AI conversa con Ana**
```
🤖 Agent: "¡Hola Ana! 👋 Encantado de atenderte.
           Tenemos estos servicios disponibles:

           • Corte de Pelo (€25 - 45 min)
           • Tinte Completo (€60 - 120 min)
           • Barba y Bigote (€15 - 30 min)

           ¿Cuál te interesa?"

Ana: "Corte de pelo"

🤖 Agent: "Perfecto! Nuestro equipo disponible:

           • María López (Estilista) ⭐️⭐️⭐️⭐️⭐️
           • Pedro Gómez (Barbero) ⭐️⭐️⭐️⭐️⭐️

           ¿Con quién prefieres tu cita?"

Ana: "Con María, por favor"

🤖 Agent: [Llama a check_availability tool]

🤖 Agent: "Horarios disponibles con María:

           • Hoy 10/11 → 16:00, 17:00, 18:00
           • Mañana 11/11 → 09:00, 10:00, 11:00, 16:00

           ¿Cuál prefieres?"

Ana: "Mañana a las 10:00"
```

**Agent ejecuta:**
```typescript
await create_appointment({
  tenantId: "uuid-tenant-madrid",
  customerPhone: "+34666777888",
  serviceId: "uuid-corte-pelo",
  staffId: "uuid-maria",
  scheduledAt: "2025-11-11T10:00:00Z",
  notes: "Cliente prefiere María"
});
```

```
🤖 Agent: "✅ ¡Listo! Tienes cita confirmada:

           📅 Mañana 11/11/2025
           🕙 10:00 AM
           ✂️  Corte de Pelo
           👩‍🦰 Con María López

           📍 Salón Belleza Madrid

           Te esperamos! 😊"
```

---

#### **Paso 7: Juan ve la cita en el dashboard**
```bash
GET /api/dashboard/appointments/today
Authorization: Bearer <jwt-de-juan>

# Respuesta:
[
  {
    "id": "uuid-appointment",
    "client": "Ana García",
    "service": "Corte de Pelo",
    "staff": "María López",
    "startsAt": "2025-11-11T10:00:00Z",
    "status": "CONFIRMED"
  }
]
```

Juan puede ver/editar/cancelar esta cita desde el CRM.

---

#### **Paso 8: María atiende a Ana**
Al finalizar, Juan marca la cita como completada:
```bash
PATCH /api/appointments/:id
Authorization: Bearer <jwt-de-juan>
Content-Type: application/json

{
  "status": "COMPLETED"
}
```

---

## Caso de Uso 2: Barbero Independiente

**Ejemplo:** Pedro es barbero independiente. Trabaja solo, sin empleados.

### Diferencia Clave:
- **NO tiene staff separado**
- **Él es TenantUser Y trabaja solo**
- Los clientes piden cita directamente con "el negocio" (que es él)

---

### Entidades Creadas:

```
┌─────────────────────────────────────────┐
│         TENANT                          │
│   "Barbería Pedro"                      │
│   whatsapp: +34666333444                │
└──────────┬──────────────────────────────┘
           │
           ├─── TenantUser (Él mismo)
           │    └─ Pedro Gómez (OWNER) ──────────► Es dueño Y barbero
           │
           ├─── Staff (OPCIONAL)
           │    └─ [Vacío o Pedro se crea a sí mismo como staff]
           │
           └─── Users (Clientes)
                ├─ Carlos Díaz (+34666888999)
                └─ Luis Martín (+34666777666)
```

---

### Flujo Completo: Barbero Independiente

#### **Paso 1: Pedro crea su barbería**
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "tenantName": "Barbería Pedro",
  "email": "pedro@barberiapedro.com",
  "password": "BarberPass123!",
  "ownerName": "Pedro Gómez",
  "subdomain": "barberiapedro",
  "whatsappNumber": "+34666333444"
}
```

**Se crea:**
- ✅ **Tenant**: Barbería Pedro
- ✅ **TenantUser**: Pedro Gómez (OWNER)

---

#### **Paso 2: Pedro agrega sus servicios**
```bash
POST /api/services
Authorization: Bearer <jwt-de-pedro>

{
  "name": "Corte Clásico",
  "price": 15.00,
  "duration_minutes": 30
}

# Agrega más: "Corte + Barba", "Afeitado Tradicional", etc.
```

---

#### **Paso 3: (OPCIONAL) Pedro se crea como Staff**

Pedro tiene 2 opciones:

**Opción A: NO crear staff** (appointments sin staffId)
- Las citas se crean sin `staff_id`
- En el dashboard aparece "Sin asignar" o "Pedro (dueño)"
- Más simple para negocios de 1 persona

**Opción B: Crearse a sí mismo como staff**
```bash
POST /api/staff
Authorization: Bearer <jwt-de-pedro>

{
  "name": "Pedro Gómez",
  "role": "BARBER",
  "email": "pedro@barberiapedro.com",
  "phone": "+34666333444"
}
```

**Beneficios de crear staff:**
- Puede agregar más barberos después
- Mejor organización en el dashboard
- El agent AI puede mencionar "cita con Pedro"

---

#### **Paso 4: Cliente Carlos pide cita por WhatsApp**
```
📱 WhatsApp: +34666333444

Carlos: "Hola Pedro, necesito corte para hoy si puedes"

🤖 Agent: "Hola Carlos! Por supuesto. Tengo disponible:

           • 15:00
           • 16:00
           • 17:30

           ¿Cuál te viene bien?"

Carlos: "16:00 perfecto"

🤖 Agent: "✅ Listo! Te espero hoy a las 16:00 para tu corte.

           📍 Barbería Pedro
           Calle Mayor 23

           Nos vemos! 💈"
```

**Agent crea:**
```typescript
await create_appointment({
  tenantId: "uuid-tenant-pedro",
  customerPhone: "+34666888999",
  serviceId: "uuid-corte-clasico",
  staffId: null,  // ← O uuid-pedro-staff si creó staff
  scheduledAt: "2025-11-10T16:00:00Z"
});
```

---

#### **Paso 5: Pedro ve su agenda**
```bash
GET /api/dashboard/appointments/today
Authorization: Bearer <jwt-de-pedro>

# Ve:
[
  {
    "client": "Carlos Díaz",
    "service": "Corte Clásico",
    "staff": null,  // O "Pedro Gómez" si creó staff
    "startsAt": "2025-11-10T16:00:00Z",
    "status": "CONFIRMED"
  }
]
```

---

#### **Paso 6: (FUTURO) Pedro contrata a un ayudante**
Más adelante, si crece:
```bash
POST /api/staff
Authorization: Bearer <jwt-de-pedro>

{
  "name": "Luis Hernández",
  "role": "BARBER",
  "email": "luis@barberiapedro.com"
}
```

Ahora los clientes pueden elegir:
```
🤖 Agent: "¿Con quién prefieres tu cita?
           • Pedro Gómez (dueño)
           • Luis Hernández"
```

---

## Diagrama de Relaciones

### Modelo Completo de Datos:

```
┌──────────────────────────────────────────────────────────────┐
│                           TENANT                             │
│  • Representa el negocio completo                            │
│  • Todos los datos pertenecen a un tenant                    │
└─────────┬───────────────┬─────────────┬──────────────────────┘
          │               │             │
          │               │             │
   ┌──────▼─────┐  ┌──────▼──────┐  ┌──▼──────────┐
   │ TenantUser │  │    Staff    │  │    User     │
   │            │  │             │  │             │
   │ Administra │  │  Trabaja en │  │ Cliente de  │
   │ el negocio │  │  el negocio │  │ el negocio  │
   │            │  │             │  │             │
   │ [LOGIN ✓]  │  │ [NO login]  │  │ [NO login]  │
   └────────────┘  └──────┬──────┘  └──────┬──────┘
                          │                 │
                          │                 │
                    ┌─────▼─────────────────▼──────┐
                    │       APPOINTMENT            │
                    │                              │
                    │  staff_id (quien atiende)    │
                    │  user_id (quien pide)        │
                    │  service_id (qué servicio)   │
                    │  scheduled_at (cuándo)       │
                    └──────────────────────────────┘
```

---

## Seguridad y Aislamiento

### JWT (JSON Web Token)
Cuando un TenantUser se loguea, recibe un JWT:
```json
{
  "sub": "uuid-juan",           // userId
  "email": "juan@salonmadrid.com",
  "tenantId": "uuid-tenant-madrid",  // ← MUY IMPORTANTE
  "role": "OWNER",
  "iat": 1699564800,
  "exp": 1699651200
}
```

### Decorador @CurrentTenant()
Todos los endpoints protegidos usan este decorator:
```typescript
@Get()
async getAppointments(@CurrentTenant() tenantId: string) {
  // tenantId = "uuid-tenant-madrid" (extraído del JWT)

  return await this.appointmentsRepository.find({
    where: { tenant: { id: tenantId } }
  });
}
```

**Resultado:**
- Juan (Salón Madrid) **NUNCA** verá appointments de Pedro (Barbería Pedro)
- Cada tenant está completamente aislado
- No es posible acceder a datos de otro tenant

---

### Endpoints Públicos vs Protegidos

**Públicos** (no requieren JWT):
```typescript
@Public()
@Post('auth/signup')  // Crear cuenta

@Public()
@Post('auth/login')   // Iniciar sesión

@Public()
@Get('health')        // Health check
```

**Protegidos** (requieren JWT válido):
```typescript
// Automáticamente protegido por JwtAuthGuard global
@Get('appointments')
@Get('services')
@Post('staff')
@Get('dashboard/stats')
```

---

## API Endpoints por Rol

### TenantUser (Dueño/Admin)

**Autenticación:**
```
POST   /api/auth/signup      Crear tenant + usuario
POST   /api/auth/login       Iniciar sesión
GET    /api/auth/me          Info del usuario actual
```

**Staff:**
```
POST   /api/staff            Crear empleado
GET    /api/staff            Listar todos los empleados
GET    /api/staff/active     Listar empleados activos
GET    /api/staff/:id        Ver empleado específico
PUT    /api/staff/:id        Actualizar empleado
PATCH  /api/staff/:id/deactivate   Desactivar empleado
DELETE /api/staff/:id        Eliminar empleado
```

**Servicios:**
```
POST   /api/services         Crear servicio
GET    /api/services         Listar servicios
PATCH  /api/services/:id     Actualizar servicio
POST   /api/services/:id/deactivate   Desactivar servicio
```

**Appointments:**
```
GET    /api/appointments     Listar todas las citas
POST   /api/appointments     Crear cita manual
PATCH  /api/appointments/:id Actualizar cita
DELETE /api/appointments/:id Cancelar cita
```

**Dashboard:**
```
GET    /api/dashboard/stats            Estadísticas generales
GET    /api/dashboard/appointments/today   Citas de hoy
```

**Clientes:**
```
GET    /api/clients          Listar todos los clientes
GET    /api/clients/analytics Analíticas de clientes
```

**WhatsApp:**
```
GET    /api/whatsapp/status  Estado de conexión
GET    /api/whatsapp/qr      Obtener QR para vincular
POST   /api/whatsapp/number  Vincular con número
POST   /api/whatsapp/logout  Desvincular WhatsApp
```

---

### Endpoints Internos (WhatsApp Service)

Protegidos con `ApiKeyGuard` (no JWT):
```
POST   /api/internal/upsert_user   Crear/actualizar cliente
POST   /api/tenants/bootstrap      Obtener tenant default
```

---

## Comparación: Salon vs Independiente

| Aspecto | Salón con Staff | Barbero Independiente |
|---------|----------------|----------------------|
| **Tenants** | 1 | 1 |
| **TenantUsers** | 1+ (dueño, admins) | 1 (él mismo) |
| **Staff** | Múltiples (3-10+) | 0 o 1 (él mismo) |
| **Appointments** | `staff_id` → María/Pedro/Laura | `staff_id` → null o él mismo |
| **Dashboard** | Ve agenda de todo el equipo | Ve solo su agenda |
| **Escalabilidad** | Puede crecer fácilmente | Puede agregar staff después |

---

## Ejemplos de Queries

### Salón Madrid - Ver citas de María
```typescript
// Juan (owner) quiere ver citas de María
const appointments = await appointmentsRepository.find({
  where: {
    tenant: { id: juanTenantId },    // Solo su salon
    staff: { id: mariaStaffId }       // Solo citas de María
  },
  relations: ['service', 'user', 'staff']
});
```

### Pedro - Ver todas sus citas
```typescript
// Pedro (independiente) quiere ver todas sus citas
const appointments = await appointmentsRepository.find({
  where: {
    tenant: { id: pedroTenantId }     // Solo su barbería
    // NO filtra por staff (porque no usa staff o solo tiene 1)
  },
  relations: ['service', 'user']
});
```

---

## Guest Appointments (Sin User registrado)

Ambos casos soportan citas sin User:
```typescript
// Cliente llama por teléfono (no WhatsApp)
await appointmentsRepository.save({
  tenant_id: tenantId,
  user_id: null,                      // ← No hay User
  customer_name: "Roberto González",  // ← Datos manuales
  customer_phone: "+34666555444",
  service_id: serviceId,
  staff_id: staffId || null,
  scheduled_at: new Date("2025-11-10T12:00:00Z")
});
```

---

## Conclusión

**Flexibilidad del Sistema:**
1. ✅ Soporta salones grandes con múltiples empleados
2. ✅ Soporta profesionales independientes (1 persona)
3. ✅ Permite crecer: un independiente puede agregar staff después
4. ✅ Multi-tenant: múltiples negocios en la misma infraestructura
5. ✅ Aislamiento total: cada negocio solo ve sus datos

**Ambos flujos usan la misma API**, solo cambia:
- Cantidad de Staff (muchos vs 0-1)
- Uso del `staff_id` en appointments (específico vs null)

---

## Próximos Pasos

**Mejoras futuras:**
- [ ] Staff con login (para ver su propia agenda)
- [ ] Multi-tenant WhatsApp (un número por tenant)
- [ ] Roles más granulares (permisos por módulo)
- [ ] Clientes con login (historial de citas)
- [ ] Integración con pagos
- [ ] Sistema de valoraciones (clientes califican staff)

---

**Documentación generada:** 2025-11-09
**Versión del sistema:** 1.0.0
**Autor:** Nexora Team
