# Google Calendar Integration

Integración bidireccional con Google Calendar para sincronizar automáticamente las citas del salón.

## Características

### Sincronización Bidireccional
- ✅ Citas creadas en el sistema → Se crean en Google Calendar
- ✅ Citas canceladas en el sistema → Se eliminan de Google Calendar
- ✅ Eventos modificados en Google Calendar → Se actualizan en el sistema
- ✅ Eventos cancelados en Google Calendar → Se marcan como cancelados en el sistema
- ✅ Verificación de disponibilidad consultando Google Calendar en tiempo real

### Prevención de Conflictos
- El agente verifica la disponibilidad tanto en la base de datos como en Google Calendar
- Si el staff tiene un evento personal en su calendario, el horario no estará disponible para citas
- Sincronización automática cada vez que Google Calendar envía una notificación de cambio

## Configuración

### 1. Crear Credenciales de Google Cloud Platform

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google Calendar API**:
   - Ve a "APIs & Services" → "Library"
   - Busca "Google Calendar API"
   - Click en "Enable"

4. Crea credenciales OAuth2:
   - Ve a "APIs & Services" → "Credentials"
   - Click en "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Authorized redirect URIs: `http://localhost:8000/api/google-calendar/oauth/callback`
   - (En producción usa tu dominio real: `https://tu-dominio.com/api/google-calendar/oauth/callback`)

5. Copia el **Client ID** y **Client Secret**

### 2. Configurar Variables de Entorno

Agrega las siguientes variables en tu archivo `.env`:

```bash
# Google Calendar Integration
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google-calendar/oauth/callback
GOOGLE_CALENDAR_WEBHOOK_URL=https://tu-dominio.com/api/google-calendar/webhook
```

⚠️ **Importante**:
- `GOOGLE_REDIRECT_URI` debe coincidir exactamente con la URI autorizada en Google Cloud Console
- `GOOGLE_CALENDAR_WEBHOOK_URL` debe ser una URL pública accesible desde Internet (no localhost)
- Para desarrollo local, usa [ngrok](https://ngrok.com/) o similar para exponer tu servidor

### 3. Configurar Webhook Público (Producción)

Para que Google Calendar pueda notificar cambios, necesitas una URL pública:

**Opción A - Ngrok (Desarrollo)**
```bash
ngrok http 8000
# Copia la URL https generada y úsala en GOOGLE_CALENDAR_WEBHOOK_URL
```

**Opción B - Dominio Propio (Producción)**
- Configura tu servidor con un dominio público
- Asegúrate de que `https://tu-dominio.com/api/google-calendar/webhook` sea accesible
- Configura SSL/TLS (Google requiere HTTPS para webhooks)

## Uso

### Conectar Google Calendar de un Staff Member

1. **Desde la API**:
   ```bash
   GET /api/google-calendar/connect/:staffId
   ```
   - Requiere autenticación JWT
   - Redirige al usuario a la pantalla de consentimiento de Google
   - Después de autorizar, se redirige al callback y almacena las credenciales

2. **Flujo de Usuario**:
   - El staff hace clic en "Conectar Google Calendar" en su perfil
   - Se abre la ventana de autorización de Google
   - El staff acepta los permisos
   - ✅ Listo! Las citas se sincronizarán automáticamente

### Verificar Estado de Conexión

```bash
GET /api/google-calendar/status/:staffId
```

**Respuesta**:
```json
{
  "connected": true,
  "syncEnabled": true,
  "calendarId": "primary",
  "lastSynced": "2025-11-13T23:45:00Z"
}
```

### Desconectar Google Calendar

```bash
POST /api/google-calendar/disconnect/:staffId
```

Esto:
- Detiene la sincronización
- Elimina las credenciales almacenadas
- Cancela el webhook con Google
- ⚠️ No elimina eventos ya creados en Google Calendar

## Funcionamiento

### Al Crear una Cita

1. Cliente llama/escribe al agente
2. Agente verifica disponibilidad:
   - Consulta la base de datos
   - **Consulta Google Calendar** del staff asignado
3. Si está disponible, crea la cita
4. **Automáticamente crea el evento en Google Calendar**
5. Almacena el `google_event_id` en la cita

### Al Cancelar una Cita

1. Cita se cancela en el sistema
2. **Automáticamente elimina el evento de Google Calendar**

### Al Modificar Evento en Google Calendar

1. Staff mueve/cancela/edita un evento en su Google Calendar
2. Google envía notificación webhook
3. Sistema sincroniza los cambios:
   - Si se canceló → Marca la cita como cancelada
   - Si se reprogramó → Actualiza `scheduled_at`

### Al Verificar Disponibilidad

El agente ejecuta `check_availability` que:
1. Verifica conflictos en la base de datos
2. **Verifica conflictos en Google Calendar**
3. Solo permite la reserva si ambos están libres

## Estructura de Base de Datos

### Tabla `google_calendar_credentials`

```sql
CREATE TABLE google_calendar_credentials (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL UNIQUE REFERENCES staff(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry_date TIMESTAMP,
  calendar_id VARCHAR(255) DEFAULT 'primary',
  watch_channel_id VARCHAR(255),
  watch_resource_id VARCHAR(255),
  watch_expiration TIMESTAMP,
  sync_enabled BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Campos Agregados a `appointments`

```sql
ALTER TABLE appointments
ADD COLUMN google_event_id VARCHAR(255),
ADD COLUMN google_synced_at TIMESTAMP;
```

## Arquitectura

```
┌─────────────────┐
│   Agente AI     │
│   (WhatsApp/    │
│    Voice)       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  AppointmentsService    │
│  - create()             │
│  - cancel()             │
│  - checkAvailability()  │
└──────────┬──────────────┘
           │
           ▼
┌──────────────────────────┐      ┌─────────────────┐
│ GoogleCalendarService    │◄────►│ Google Calendar │
│ - createEvent()          │      │      API        │
│ - deleteEvent()          │      └────────┬────────┘
│ - checkAvailability()    │               │
│ - syncFromGoogle()       │               │ Webhook
└──────────────────────────┘               │
           ▲                                ▼
           │                      ┌──────────────────┐
           └──────────────────────│ /webhook         │
                                  │ (POST)           │
                                  └──────────────────┘
```

## Solución de Problemas

### Error: "Failed to sync to Google Calendar"

**Causas comunes**:
- Token expirado → El sistema intentará renovarlo automáticamente
- Staff no tiene Google Calendar conectado → Conectar primero
- Red/API de Google no disponible → Se registra error pero no falla la cita

### Webhooks no funcionan

**Checklist**:
1. ✅ `GOOGLE_CALENDAR_WEBHOOK_URL` está configurado
2. ✅ La URL es pública y accesible desde Internet
3. ✅ Usa HTTPS (requerido por Google)
4. ✅ El canal de watch está activo (se renueva cada 7 días)

### Citas no se sincronizan

1. Verifica que el staff tenga Google Calendar conectado:
   ```bash
   GET /api/google-calendar/status/:staffId
   ```

2. Verifica que `sync_enabled` sea `true`

3. Revisa los logs del servidor para errores de API de Google

### Renovación de Tokens

Los tokens de Google expiran periódicamente. El sistema:
- Detecta automáticamente tokens expirados
- Usa el `refresh_token` para obtener un nuevo `access_token`
- Actualiza las credenciales en la base de datos
- ⚠️ Si el `refresh_token` falla, el staff debe reconectar manualmente

## Seguridad

### Datos Sensibles
- ✅ Tokens OAuth2 se almacenan en la base de datos (considera encriptarlos en producción)
- ✅ Solo staff autenticado puede conectar su calendario
- ✅ Cada staff tiene su propio calendario (multi-tenant safe)

### Permisos de Google
La aplicación solicita los siguientes scopes:
- `https://www.googleapis.com/auth/calendar` - Acceso completo al calendario
- `https://www.googleapis.com/auth/calendar.events` - Gestión de eventos

### Webhook Validation
Google envía los siguientes headers en webhooks:
- `x-goog-channel-id` - ID del canal
- `x-goog-resource-id` - ID del recurso
- `x-goog-resource-state` - Estado (sync, exists, update)

## Próximos Pasos (Opcional)

- [ ] Encriptar tokens en base de datos
- [ ] UI para que staff conecte su calendario
- [ ] Dashboard para ver estado de sincronización
- [ ] Notificaciones si falla la sincronización
- [ ] Soporte para múltiples calendarios por staff
- [ ] Sincronización de colores y categorías
- [ ] Sincronización de recordatorios

## Referencias

- [Google Calendar API Docs](https://developers.google.com/calendar/api/guides/overview)
- [OAuth2 for Web Servers](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Push Notifications](https://developers.google.com/calendar/api/guides/push)
