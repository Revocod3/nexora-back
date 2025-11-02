# Plan de Implementación - Dashboard del Salón

## 📋 Resumen Ejecutivo

Este documento describe el plan de implementación para crear un dashboard web completo para gestión de salón de belleza, que permita visualizar y administrar citas, clientes, servicios y métricas en tiempo real.

---

## 🎯 Objetivos

### Objetivos Principales
1. **Dashboard de Control**: Vista centralizada de operaciones diarias
2. **Gestión de Citas**: CRUD completo con calendario visual
3. **Gestión de Clientes**: Base de datos de clientes y historial
4. **Gestión de Servicios**: Administración de catálogo de servicios
5. **Métricas y Reportes**: KPIs y análisis de rendimiento
6. **Integración WhatsApp**: Visualización de conversaciones activas

### Objetivos Secundarios
- Sistema de notificaciones en tiempo real
- Exportación de reportes (PDF/Excel)
- Sistema de recordatorios automáticos
- Configuración multi-tenant

---

## 🏗️ Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
│  ┌──────────────┬──────────────┬──────────────────────┐ │
│  │  Dashboard   │  Calendar    │  Customer Management │ │
│  │  Analytics   │  Services    │  Settings            │ │
│  └──────────────┴──────────────┴──────────────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ REST API / WebSocket
                         ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND (NestJS - CRM Service)              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Dashboard API Module                            │   │
│  │  - Dashboard Controller                          │   │
│  │  - Dashboard Service                             │   │
│  │  - Analytics Service                             │   │
│  │  - Notifications Gateway (WebSocket)             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  Existing Modules:                                       │
│  - Appointments Module                                   │
│  - Users Module                                          │
│  - Services Module                                       │
│  - Tenants Module                                        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                     │
│  Tables: appointments, users, services, tenants          │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Fase 1: Backend - API del Dashboard (Semana 1-2)

### 1.1 Crear Módulo de Dashboard

**Archivos a crear:**
```
services/crm/src/modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
├── dashboard.service.ts
├── analytics.service.ts
├── dto/
│   ├── dashboard-stats.dto.ts
│   ├── analytics-query.dto.ts
│   └── appointment-calendar.dto.ts
└── interfaces/
    └── dashboard.interfaces.ts
```

**Funcionalidades:**

#### 1.1.1 Dashboard Service
```typescript
// Endpoints principales:
- GET /api/dashboard/stats - Estadísticas generales
- GET /api/dashboard/appointments/today - Citas del día
- GET /api/dashboard/appointments/upcoming - Próximas citas (7 días)
- GET /api/dashboard/revenue/summary - Resumen de ingresos
- GET /api/dashboard/clients/recent - Clientes recientes
- GET /api/dashboard/services/popular - Servicios más solicitados
```

**Métricas a calcular:**
- Total de citas del día/semana/mes
- Tasa de ocupación (%)
- Ingresos totales y promedio por servicio
- Clientes nuevos vs recurrentes
- Tasa de no-show
- Horarios pico de reservas

#### 1.1.2 Analytics Service
```typescript
// Análisis temporal:
- Ingresos por periodo (día/semana/mes/año)
- Comparativa con periodo anterior
- Tendencias de reservas
- Servicios más rentables
- Análisis de clientes (frecuencia, gasto promedio)
- Métricas de conversión (WhatsApp -> Cita)
```

### 1.2 Ampliar Módulos Existentes

#### 1.2.1 Appointments Module - Nuevos Endpoints
```typescript
// Añadir a appointments.controller.ts:
- GET /api/appointments/calendar?start=&end= - Vista calendario
- PATCH /api/appointments/:id/reschedule - Reprogramar
- GET /api/appointments/conflicts - Detectar conflictos
- POST /api/appointments/bulk - Crear múltiples citas
- GET /api/appointments/stats - Estadísticas de citas
```

#### 1.2.2 Users Module - Extensión para Clientes
```typescript
// Añadir a users.controller.ts:
- GET /api/users/clients - Lista de clientes (paginado)
- GET /api/users/:id/history - Historial de citas
- GET /api/users/:id/stats - Estadísticas del cliente
- PATCH /api/users/:id/notes - Notas del cliente
- GET /api/users/search?q= - Búsqueda de clientes
```

#### 1.2.3 Services Module - Gestión Completa
```typescript
// Añadir a services.controller.ts:
- GET /api/services/stats - Estadísticas por servicio
- PATCH /api/services/:id/status - Activar/desactivar
- POST /api/services/:id/duplicate - Duplicar servicio
- GET /api/services/revenue - Ingresos por servicio
```

### 1.3 Sistema de Notificaciones WebSocket

**Archivo:**
```
services/crm/src/notifications/
├── notifications.module.ts
├── notifications.gateway.ts
└── dto/
    └── notification.dto.ts
```

**Eventos en tiempo real:**
- Nueva cita creada (desde WhatsApp o admin)
- Cita cancelada
- Cliente nuevo registrado
- Recordatorio de cita próxima
- Actualización de estado de cita

### 1.4 Entidades Nuevas (Opcional)

Considerar añadir:

```typescript
// Employee Entity (si hay múltiples empleados)
@Entity('employees')
export class Employee {
  id: string;
  name: string;
  role: string;
  schedule: JSON; // Horario de trabajo
}

// Payment Entity
@Entity('payments')
export class Payment {
  id: string;
  appointment: Appointment;
  amount: number;
  method: 'cash' | 'card' | 'transfer';
  status: 'pending' | 'completed' | 'refunded';
}

// ClientNote Entity
@Entity('client_notes')
export class ClientNote {
  id: string;
  user: User;
  note: string;
  created_by: string; // Admin/Employee
}
```

---

## 🎨 Fase 2: Frontend - Dashboard Web (Semana 3-5)

### 2.1 Configuración Inicial

**Estructura del proyecto:**
```
nexora-dashboard/
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── .env.local
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── layout.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx
│   │       ├── dashboard/
│   │       ├── appointments/
│   │       ├── clients/
│   │       ├── services/
│   │       ├── analytics/
│   │       └── settings/
│   ├── components/
│   │   ├── ui/ (shadcn/ui)
│   │   ├── dashboard/
│   │   ├── appointments/
│   │   ├── clients/
│   │   └── layout/
│   ├── lib/
│   │   ├── api/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── validations/
│   ├── types/
│   └── store/ (Zustand o Redux)
└── README.md
```

**Stack Tecnológico:**
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React 18+
- **Styling**: TailwindCSS + shadcn/ui
- **Forms**: React Hook Form + Zod
- **State**: Zustand o Redux Toolkit
- **API Client**: Axios o Fetch con SWR/React Query
- **Charts**: Recharts o Chart.js
- **Calendar**: react-big-calendar o FullCalendar
- **Tables**: TanStack Table
- **Real-time**: Socket.io Client
- **Date**: date-fns o day.js

### 2.2 Páginas Principales

#### 2.2.1 Dashboard Principal (`/dashboard`)
```typescript
Componentes:
- StatsCards (4 cards con métricas principales)
- AppointmentsToday (Lista de citas del día)
- RevenueChart (Gráfico de ingresos últimos 7 días)
- PopularServices (Top 5 servicios)
- RecentClients (Últimos 5 clientes)
- QuickActions (Botones: Nueva Cita, Nuevo Cliente)
```

#### 2.2.2 Gestión de Citas (`/appointments`)
```typescript
Vistas:
1. Vista Lista (default)
   - Tabla con filtros (fecha, estado, servicio, cliente)
   - Acciones: Ver, Editar, Cancelar, Confirmar
   - Paginación
   
2. Vista Calendario
   - Mensual/Semanal/Diaria
   - Drag & drop para reprogramar
   - Color coding por estado
   - Quick view al hacer click
   
3. Nueva Cita Modal
   - Selector de cliente (buscar o crear nuevo)
   - Selector de servicio
   - Date & time picker con slots disponibles
   - Notas opcionales
   - Confirmación con resumen
```

#### 2.2.3 Gestión de Clientes (`/clients`)
```typescript
Componentes:
- ClientsTable (búsqueda, filtros, ordenamiento)
- ClientDetailModal
  - Información personal
  - Historial de citas
  - Estadísticas (total gastado, frecuencia)
  - Notas privadas
  - Acciones: Editar, Nueva Cita, WhatsApp
```

#### 2.2.4 Gestión de Servicios (`/services`)
```typescript
Componentes:
- ServicesGrid o ServicesTable
- ServiceForm (Create/Edit)
  - Nombre
  - Descripción
  - Duración (minutos)
  - Precio
  - Estado (activo/inactivo)
  - Categoría (opcional)
- ServiceStats (por servicio individual)
```

#### 2.2.5 Analytics (`/analytics`)
```typescript
Secciones:
1. Resumen General
   - KPIs principales
   - Comparativa periodo anterior
   
2. Análisis de Ingresos
   - Gráfico temporal
   - Por servicio
   - Por método de pago
   
3. Análisis de Citas
   - Tasa de ocupación
   - Distribución por horario
   - Tasa de cancelación/no-show
   
4. Análisis de Clientes
   - Nuevos vs recurrentes
   - CLV (Customer Lifetime Value)
   - Frecuencia de visitas
   
5. Exportar Reportes
   - PDF
   - Excel
   - Rango de fechas personalizado
```

#### 2.2.6 Configuración (`/settings`)
```typescript
Pestañas:
1. Información del Salón
   - Nombre, email, teléfono
   - Dirección
   - Horario de atención
   
2. Notificaciones
   - Configurar recordatorios
   - Templates de WhatsApp
   
3. Integraciones
   - Estado de WhatsApp
   - Logs de sincronización
   
4. Usuarios/Empleados (futuro)
   - Gestión de accesos
```

### 2.3 Componentes Reutilizables

#### UI Components (shadcn/ui base)
- Button, Input, Select, Textarea
- Dialog, Drawer, Sheet
- Table, Card, Badge
- Calendar, DatePicker
- Command (búsqueda con Cmd+K)
- Toast, Alert

#### Custom Components
```typescript
// Layout
- Sidebar
- Navbar
- Breadcrumbs

// Data Display
- StatsCard
- DataTable
- EmptyState
- LoadingState

// Forms
- ClientSearchCombobox
- ServiceSelector
- TimeSlotPicker
- AppointmentForm

// Visualizations
- LineChart
- BarChart
- PieChart
- HeatMap (para horarios)

// Real-time
- NotificationBell
- LiveActivityFeed
```

---

## 🔐 Fase 3: Autenticación y Seguridad (Semana 4)

### 3.1 Backend - Auth Module

```typescript
services/crm/src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── local.strategy.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   └── roles.guard.ts
└── dto/
    ├── login.dto.ts
    └── register.dto.ts
```

**Endpoints:**
- POST /api/auth/login
- POST /api/auth/register
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me

**Implementar:**
- JWT tokens (access + refresh)
- Bcrypt para passwords
- Rate limiting
- CORS configurado
- Helmet para headers de seguridad

### 3.2 Frontend - Auth Flow

```typescript
// Páginas:
- /login
- /register (si aplica)
- /forgot-password

// Protección de rutas:
- Middleware para verificar token
- Redirect a /login si no autenticado
- Layout wrapper con verificación

// Estado global:
- User profile
- Auth tokens
- Permissions
```

---

## 📊 Fase 4: Integraciones y Features Avanzadas (Semana 5-6)

### 4.1 Sistema de Recordatorios

**Backend:**
```typescript
services/crm/src/reminders/
├── reminders.module.ts
├── reminders.service.ts
└── schedulers/
    └── appointment-reminder.scheduler.ts
```

**Funcionalidad:**
- Cron job que revisa citas próximas (24h antes)
- Envía recordatorio por WhatsApp automáticamente
- Marca appointment.reminder_sent = true
- Log de recordatorios enviados

### 4.2 Exportación de Reportes

**Backend:**
```typescript
services/crm/src/reports/
├── reports.module.ts
├── reports.controller.ts
├── reports.service.ts
└── generators/
    ├── pdf.generator.ts
    └── excel.generator.ts
```

**Librerías:**
- PDFKit o Puppeteer para PDF
- ExcelJS para Excel

**Reportes disponibles:**
- Reporte diario de citas
- Reporte mensual de ingresos
- Reporte de clientes
- Reporte personalizado por rango de fechas

### 4.3 Dashboard en Tiempo Real

**WebSocket Events:**
```typescript
// Cliente se conecta
io.on('connection', (socket) => {
  
  // Suscribirse a eventos del tenant
  socket.on('subscribe:tenant', (tenantId) => {
    socket.join(`tenant:${tenantId}`);
  });
  
  // Emitir eventos:
  io.to(`tenant:${tenantId}`).emit('appointment:created', data);
  io.to(`tenant:${tenantId}`).emit('appointment:updated', data);
  io.to(`tenant:${tenantId}`).emit('appointment:cancelled', data);
  io.to(`tenant:${tenantId}`).emit('client:new', data);
  io.to(`tenant:${tenantId}`).emit('stats:updated', data);
});
```

**Frontend:**
```typescript
// useWebSocket hook
- Conectar al WebSocket
- Escuchar eventos
- Actualizar estado local
- Mostrar notificaciones toast
- Actualizar dashboard en vivo
```

### 4.4 Búsqueda Global

**Implementar:**
- Cmd+K o Ctrl+K para abrir búsqueda
- Buscar en: Citas, Clientes, Servicios
- Navegación rápida
- Historial de búsquedas

---

## 🧪 Fase 5: Testing y QA (Semana 7)

### 5.1 Backend Testing

```bash
services/crm/src/**/*.spec.ts
```

**Tests a crear:**
- Unit tests para services
- Integration tests para controllers
- E2E tests para flujos principales

**Coverage objetivo:** >80%

### 5.2 Frontend Testing

```bash
nexora-dashboard/src/**/*.test.tsx
```

**Tests a crear:**
- Component tests (Jest + React Testing Library)
- Integration tests para páginas
- E2E tests con Playwright o Cypress

**Escenarios críticos:**
- Crear nueva cita
- Cancelar cita
- Búsqueda de clientes
- Login/logout
- Responsive design

### 5.3 Testing Manual

**Checklist:**
- [ ] Flujo completo de crear cita
- [ ] Flujo completo de gestión de cliente
- [ ] Verificar tiempo real (WebSocket)
- [ ] Probar en móvil y tablet
- [ ] Probar con diferentes timezones
- [ ] Verificar permisos y seguridad
- [ ] Performance (Lighthouse score >90)

---

## 🚀 Fase 6: Deployment (Semana 8)

### 6.1 Backend

**Opciones:**
1. **Docker Compose** (actual - extender)
2. **Railway/Render** (fácil deploy)
3. **AWS ECS/Fargate** (escalable)
4. **DigitalOcean App Platform**

**Configuración:**
```yaml
# docker-compose.yaml - añadir servicio dashboard si es separado
# o usar el CRM existente con nuevas rutas
```

**Environment Variables:**
```env
# Dashboard específico
DASHBOARD_URL=https://dashboard.nexora.com
JWT_SECRET=<secret>
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d
```

### 6.2 Frontend

**Opciones:**
1. **Vercel** (recomendado para Next.js)
2. **Netlify**
3. **AWS Amplify**
4. **Cloudflare Pages**

**Build configuration:**
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "installCommand": "pnpm install"
}
```

**Environment Variables:**
```env
NEXT_PUBLIC_API_URL=https://api.nexora.com
NEXT_PUBLIC_WS_URL=wss://api.nexora.com
NEXT_PUBLIC_APP_NAME=Nexora Dashboard
```

### 6.3 CI/CD Pipeline

**GitHub Actions:**
```yaml
# .github/workflows/deploy-dashboard.yml
name: Deploy Dashboard

on:
  push:
    branches: [main]
    paths:
      - 'services/crm/src/modules/dashboard/**'
      - 'nexora-dashboard/**'

jobs:
  deploy-backend:
    # Build y deploy del backend
    
  deploy-frontend:
    # Build y deploy del frontend
```

---

## 📱 Fase 7: Mobile-First & PWA (Opcional - Semana 9)

### 7.1 Progressive Web App

**Añadir:**
- Service Worker
- Manifest.json
- Iconos para todas las plataformas
- Offline fallback
- Push notifications (browser)

### 7.2 Responsive Design

**Breakpoints:**
- Mobile: 320px - 639px
- Tablet: 640px - 1023px
- Desktop: 1024px+

**Optimizaciones móviles:**
- Bottom navigation para móvil
- Touch-friendly buttons (min 44px)
- Swipe gestures
- Mobile-optimized calendar

---

## 🔧 Fase 8: Optimizaciones y Performance (Semana 10)

### 8.1 Backend Optimizations

- [ ] Implementar caching (Redis)
- [ ] Database indexing
- [ ] Query optimization (N+1 queries)
- [ ] Rate limiting
- [ ] Compression (gzip)
- [ ] CDN para assets estáticos

### 8.2 Frontend Optimizations

- [ ] Code splitting
- [ ] Lazy loading de componentes
- [ ] Image optimization (next/image)
- [ ] Bundle analysis y tree shaking
- [ ] Server-side rendering donde aplique
- [ ] Prefetching de datos
- [ ] Memoization (React.memo, useMemo)

### 8.3 Monitoring

**Herramientas:**
- **Backend**: Sentry, New Relic, o DataDog
- **Frontend**: Vercel Analytics, Google Analytics
- **Logs**: Loki + Grafana o CloudWatch
- **Uptime**: UptimeRobot o Pingdom

---

## 📈 Métricas de Éxito

### KPIs Técnicos
- ✅ API response time < 200ms (p95)
- ✅ Frontend load time < 2s
- ✅ Lighthouse score > 90
- ✅ Test coverage > 80%
- ✅ Zero downtime deployment
- ✅ WebSocket latency < 50ms

### KPIs de Negocio
- 📊 Reducción de 50% en tiempo de gestión de citas
- 📊 100% visibilidad de operaciones en tiempo real
- 📊 Adopción del 90% por usuarios del salón
- 📊 Reducción de 30% en no-shows (con recordatorios)

---

## 🗓️ Timeline Completo

| Semana | Fase | Entregables |
|--------|------|-------------|
| 1-2 | Backend API | Dashboard API, Analytics, WebSocket |
| 3-5 | Frontend Base | Dashboard, Citas, Clientes, Servicios |
| 4 | Auth & Security | Login, JWT, Protección de rutas |
| 5-6 | Features Avanzadas | Recordatorios, Reportes, Tiempo real |
| 7 | Testing | Unit, Integration, E2E tests |
| 8 | Deployment | CI/CD, Producción |
| 9 | PWA (Opcional) | Service Worker, Mobile opt |
| 10 | Performance | Optimizaciones, Monitoring |

**Tiempo total estimado:** 8-10 semanas (2-2.5 meses)

---

## 💰 Estimación de Recursos

### Equipo Sugerido
- **1 Backend Developer** (NestJS)
- **1 Frontend Developer** (Next.js)
- **1 UI/UX Designer** (part-time)
- **1 QA Engineer** (part-time)

### Costos Aproximados (Infraestructura mensual)

| Servicio | Proveedor | Costo/mes |
|----------|-----------|-----------|
| Backend Hosting | Railway/Render | $20-50 |
| Database (PostgreSQL) | Incluido | $0 |
| Frontend Hosting | Vercel | $0-20 |
| Redis | Upstash | $0-10 |
| Monitoring | Sentry | $0-26 |
| Domain & SSL | Cloudflare | $10 |
| **TOTAL** | | **$30-116/mes** |

---

## 🎨 Design System

### Paleta de Colores
```css
/* Sugerencia basada en tema salón */
--primary: #8B5CF6 (purple-500)
--secondary: #EC4899 (pink-500)
--success: #10B981 (green-500)
--warning: #F59E0B (amber-500)
--error: #EF4444 (red-500)
--background: #FAFAFA
--card: #FFFFFF
--text: #1F2937
```

### Typography
- **Headings**: Inter/Poppins Bold
- **Body**: Inter/Poppins Regular
- **Monospace**: JetBrains Mono

### Icons
- **Library**: Lucide React / Heroicons
- **Size**: 16px, 20px, 24px

---

## 🔗 Recursos y Referencias

### Documentación
- [NestJS Docs](https://docs.nestjs.com)
- [Next.js Docs](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [TailwindCSS](https://tailwindcss.com)

### Inspiración de UI
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Linear](https://linear.app)
- [Cal.com](https://cal.com)
- [Calendly](https://calendly.com)

### Herramientas
- [Figma](https://figma.com) - Diseño
- [Excalidraw](https://excalidraw.com) - Diagramas
- [Postman](https://postman.com) - Testing API
- [TablePlus](https://tableplus.com) - DB GUI

---

## 📝 Notas de Implementación

### Decisiones de Arquitectura

1. **¿Dashboard separado o integrado en AdminJS?**
   - **Recomendación**: Dashboard separado en Next.js
   - **Razón**: Más flexible, mejor UX, escalable

2. **¿Un monorepo o repos separados?**
   - **Recomendación**: Mantener monorepo actual
   - **Estructura**: `nexora-back/dashboard/` para el frontend

3. **¿REST API o GraphQL?**
   - **Recomendación**: REST API (consistente con actual)
   - **Futuro**: Considerar GraphQL para queries complejas

4. **¿Multi-tenant desde el inicio?**
   - **Recomendación**: Sí, ya está en el modelo de datos
   - **Implementación**: Filtrar por tenantId en todos los queries

### Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Retrasos en diseño UI | Media | Alto | Usar templates de shadcn/ui |
| Problemas de performance | Baja | Alto | Load testing desde semana 7 |
| Complejidad de calendario | Alta | Medio | Usar librería probada (react-big-calendar) |
| WebSocket inestable | Media | Medio | Fallback a polling, retry logic |

---

## ✅ Checklist de Inicio

Antes de empezar, asegurar:

- [ ] Revisar y aprobar este plan con stakeholders
- [ ] Definir prioridades (MVP vs nice-to-have)
- [ ] Configurar repositorio/branch para dashboard
- [ ] Setup de herramientas de desarrollo
- [ ] Crear diseños/mockups en Figma
- [ ] Definir API contracts (OpenAPI/Swagger)
- [ ] Setup de entornos (dev/staging/prod)
- [ ] Configurar CI/CD básico

---

## 🎯 MVP (Minimum Viable Product)

Para lanzar rápido, el MVP debe incluir:

### Backend MVP (Semana 1-2)
- ✅ Dashboard stats endpoint
- ✅ CRUD de citas (calendario básico)
- ✅ CRUD de clientes
- ✅ Lista de servicios (read-only OK)
- ✅ Auth con JWT

### Frontend MVP (Semana 3-4)
- ✅ Login page
- ✅ Dashboard con stats básicas
- ✅ Lista de citas (tabla + filtros)
- ✅ Crear/editar cita (form básico)
- ✅ Lista de clientes
- ✅ Responsive design básico

**Tiempo MVP:** 4 semanas
**Post-MVP:** Añadir analytics, reportes, tiempo real, etc.

---

## 🚦 Siguiente Paso

**¿Por dónde empezar?**

1. **Aprobar el plan** y ajustar según prioridades
2. **Crear el módulo Dashboard en backend** (Fase 1.1)
3. **Setup del proyecto Next.js** (Fase 2.1)
4. **Implementar MVP** en 4 semanas
5. **Iterar** con feedback de usuarios

---

## 📞 Contacto y Soporte

- **Documentación del Proyecto**: `/home/kev/nexora-back/README.md`
- **Issues**: Crear issues en GitHub para tracking
- **Meetings**: Revisión semanal de progreso

---

**Última actualización:** Noviembre 3, 2025
**Versión:** 1.0
**Estado:** Propuesta inicial
