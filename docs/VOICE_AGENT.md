# Voice Agent - Sofía (Nexora SDR)

## Descripción

Sistema de voice agent para llamadas salientes (outbound SDR) usando:
- **Twilio** para telefonía (llamadas telefónicas reales)
- **OpenAI GPT-4o** para conversación inteligente
- **ElevenLabs** para text-to-speech con voz natural en español

El agente "Sofía" está diseñado específicamente para contactar salones de belleza en España, calificar leads y agendar demos.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    Voice Agent Flow                          │
└─────────────────────────────────────────────────────────────┘

1. API Request (POST /voice-calls)
   ↓
2. Create Call Record in DB
   ↓
3. Twilio Initiates Call → Phone rings
   ↓
4. Call Answered → Webhook to /webhook/incoming/{callId}
   ↓
5. Generate Initial Message (OpenAI)
   ↓
6. Text-to-Speech (ElevenLabs) → Audio MP3
   ↓
7. TwiML <Gather> plays audio and waits for speech
   ↓
8. User Speaks → Speech-to-Text (Twilio)
   ↓
9. Webhook to /webhook/response/{callId}
   ↓
10. Generate Response (OpenAI GPT-4o)
    ↓
11. Loop steps 6-10 until conversation ends
    ↓
12. Analyze Call Outcome (qualified/not interested/etc.)
    ↓
13. Save Transcript & Update Database
```

## Setup

### 1. Requisitos

- Cuenta de Twilio con:
  - Account SID
  - Auth Token
  - Número de teléfono (comprado en Twilio)
- API Key de ElevenLabs
- API Key de OpenAI
- Servidor público con HTTPS (para webhooks de Twilio)

### 2. Variables de Entorno

Agregar a `.env`:

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+34912345678  # Tu número de Twilio
TWILIO_WEBHOOK_BASE_URL=https://tu-dominio.com  # URL pública con HTTPS

# ElevenLabs
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=h2cd3gvcqTp3m65Dysk7  # Voz de Sofía

# OpenAI
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o
```

### 3. Instalación

Las dependencias ya están instaladas:
- `twilio` - SDK de Twilio
- `elevenlabs` - SDK de ElevenLabs
- `openai` - SDK de OpenAI

### 4. Base de Datos

La entidad `Call` se creará automáticamente con las migraciones de TypeORM.

```sql
-- La tabla 'calls' incluye:
- id (UUID)
- tenant_id (FK)
- user_id (FK, opcional)
- direction (outbound/inbound)
- status (queued, initiated, ringing, in-progress, completed, etc.)
- twilio_call_sid
- from_number, to_number
- started_at, ended_at, duration_seconds
- conversation_transcript (JSONB)
- recording_url
- outcome (qualified, not_interested, callback, etc.)
- notes
- metadata
- cost
- error_message
```

## Uso

### Crear Llamada Saliente

**Endpoint**: `POST /voice-calls`

**Headers**:
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body**:
```json
{
  "toNumber": "+34612345678",
  "contactName": "María García",
  "businessName": "Salón Elegante",
  "userId": "uuid-opcional",
  "metadata": {
    "campaign": "q1-2024",
    "source": "website"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "call-uuid",
    "status": "initiated",
    "twilio_call_sid": "CAxxxx",
    "to_number": "+34612345678",
    "created_at": "2024-01-01T10:00:00Z"
  }
}
```

### Ver Llamada

**Endpoint**: `GET /voice-calls/:id`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "call-uuid",
    "status": "completed",
    "duration_seconds": 245,
    "outcome": "qualified",
    "conversation_transcript": [
      {
        "role": "assistant",
        "content": "Hola, soy Sofía de Nexora...",
        "timestamp": "2024-01-01T10:00:05Z"
      },
      {
        "role": "user",
        "content": "Hola, dime",
        "timestamp": "2024-01-01T10:00:15Z"
      }
    ],
    "notes": "Lead cualificado. Interesado en demo. Salón con 5 empleados...",
    "recording_url": "https://api.twilio.com/recordings/RExxxx.mp3"
  }
}
```

### Listar Llamadas

**Endpoint**: `GET /voice-calls?limit=10&offset=0&status=completed`

## Webhooks (Automáticos)

Estos endpoints son llamados automáticamente por Twilio:

- `POST /voice-calls/webhook/incoming/{callId}` - Cuando se contesta la llamada
- `POST /voice-calls/webhook/response/{callId}` - Después de cada respuesta del usuario
- `POST /voice-calls/webhook/status/{callId}` - Actualizaciones de estado
- `POST /voice-calls/webhook/recording/{callId}` - Cuando la grabación está lista
- `POST /voice-calls/webhook/amd/{callId}` - Detección de contestador automático

## Configuración de Twilio

### Webhook URL Configuration

En tu panel de Twilio, NO necesitas configurar webhooks manualmente. El código ya los configura automáticamente al hacer la llamada.

### Comprar Número de Teléfono

1. Ve a Twilio Console → Phone Numbers → Buy a Number
2. Selecciona país (España: +34)
3. Busca números con capacidad de "Voice"
4. Compra el número
5. Copia el número en formato E.164: `+34912345678`
6. Agrega a `TWILIO_PHONE_NUMBER` en `.env`

## Personalización

### Modificar System Prompt

El prompt de Sofía está en: `services/crm/src/modules/voice-calls/services/conversation.service.ts`

```typescript
this.systemPrompt = `# Prompt Agente de Voz Nexora Salones
...
`;
```

### Modificar Mensaje Inicial

```typescript
this.initialMessage = 'Hola, soy Sofía de Nexora...';
```

### Cambiar Voz de ElevenLabs

1. Ve a https://elevenlabs.io/app/voice-library
2. Selecciona o clona una voz
3. Copia el Voice ID
4. Actualiza `ELEVENLABS_VOICE_ID` en `.env`

### Ajustar Parámetros de TTS

En `services/crm/src/modules/voice-calls/services/elevenlabs.service.ts`:

```typescript
voice_settings: {
  stability: 0.5,        // 0-1 (más alto = más estable)
  similarity_boost: 0.75, // 0-1 (qué tan similar a la voz original)
},
```

## Monitoreo y Logs

Los logs se pueden ver con:

```bash
docker logs nexora-crm -f
```

Buscar por:
- `[VoiceCallsService]` - Orquestación general
- `[ConversationService]` - Lógica de conversación
- `[TwilioService]` - Interacción con Twilio
- `[ElevenLabsService]` - Generación de audio

## Análisis de Conversaciones

Al finalizar cada llamada, el sistema analiza automáticamente:
- **Outcome**: qualified, not_interested, callback, voicemail, booked_demo
- **Summary**: Resumen de 2-3 oraciones
- **Qualification Score**: 0-100

Esta información se guarda en la base de datos y se puede usar para:
- Priorizar follow-ups
- Entrenar el modelo
- Reportes de ventas

## Costos

### Twilio
- Número de teléfono: ~$1-2 USD/mes
- Llamadas salientes: ~$0.02-0.10 USD/minuto (según país)
- Transcripción: ~$0.05 USD/minuto

### ElevenLabs
- Gratis: 10,000 caracteres/mes
- Creator: $5/mes - 30,000 caracteres
- Pro: $22/mes - 100,000 caracteres

### OpenAI
- GPT-4o: ~$2.50/$10 por 1M tokens (input/output)
- Conversación promedio: ~2,000 tokens = $0.02-0.04 USD

**Costo estimado por llamada de 3 minutos**: ~$0.30-0.50 USD

## Limitaciones Actuales

1. **Audio Storage**: Los archivos de audio se guardan temporalmente en `/tmp`. En producción, usar S3 o CDN.
2. **Concurrent Calls**: No hay límite implementado. Twilio puede manejar múltiples llamadas simultáneas.
3. **Retry Logic**: Si falla una llamada, no hay reintentos automáticos.
4. **Call Queue**: No hay sistema de cola para campañas masivas. Las llamadas se hacen bajo demanda.

## Mejoras Futuras

- [ ] Upload de audio a S3/Cloudflare R2
- [ ] Sistema de cola para campañas masivas
- [ ] Dashboard de métricas en tiempo real
- [ ] A/B testing de prompts
- [ ] Análisis de sentimiento
- [ ] Integración con CRM para auto-follow-ups
- [ ] Detección de intención mejorada
- [ ] Voicemail automático personalizado
- [ ] Transcripción en tiempo real (streaming)

## Solución de Problemas

### Error: "ELEVENLABS_API_KEY is required"

Asegúrate de tener la variable en `.env`:
```bash
ELEVENLABS_API_KEY=your-key-here
```

### Error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required"

Configura las credenciales de Twilio en `.env`.

### Twilio Webhooks No Funcionan

1. Verifica que `TWILIO_WEBHOOK_BASE_URL` sea una URL pública con HTTPS
2. Usa ngrok para desarrollo: `ngrok http 8000`
3. Actualiza la variable a la URL de ngrok: `https://xxxxx.ngrok.io`

### Audio No Se Reproduce

1. Verifica que el endpoint `/voice-calls/audio/:fileName` sea accesible públicamente
2. Considera usar S3 + CloudFront para servir audio
3. Revisa logs de ElevenLabs para errores de TTS

### Conversación Se Corta

1. Aumenta `timeout` en `generateGatherTwiML` (default: 5 segundos)
2. Verifica que OpenAI responda rápido (<2 segundos)
3. Revisa logs para errores de red

## Testing

### Hacer Llamada de Prueba

1. Configura todas las variables de entorno
2. Inicia el servidor: `docker compose up`
3. Obtén un JWT token autenticándote
4. Llama a tu propio teléfono:

```bash
curl -X POST http://localhost:8000/voice-calls \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "toNumber": "+34612345678",
    "contactName": "Test User",
    "businessName": "Test Salon"
  }'
```

## Soporte

Para preguntas o problemas:
- GitHub Issues: https://github.com/Revocod3/nexora-back/issues
- Documentación Twilio: https://www.twilio.com/docs/voice
- Documentación ElevenLabs: https://docs.elevenlabs.io/
