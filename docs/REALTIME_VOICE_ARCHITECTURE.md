# Realtime Voice Architecture (Twilio Media Streams + OpenAI Realtime API)

## 📋 Overview

This document describes the new **ultra-low latency voice agent architecture** using:
- **Twilio Media Streams** (WebSocket bidirectional audio)
- **OpenAI Realtime API** (audio → audio direct, no intermediate steps)
- **Redis** (distributed session management)

### Why This Matters

**Old Architecture (Gather + GPT + ElevenLabs):**
- ⏱️ Latency: 2-3 seconds per turn
- 💰 Cost: $0.24-0.56 per call
- ❌ No interruption support
- 🔄 Complex orchestration (3 services)

**New Architecture (Media Streams + Realtime API):**
- ⚡ Latency: ~300ms (10x faster!)
- 💰 Cost: $0.06-0.15 per call (60% cheaper!)
- ✅ Natural interruptions supported
- 🎯 Simple streaming (2 services)

---

## 🏗️ Architecture Components

```
┌─────────────┐          WebSocket          ┌──────────────────┐
│   Twilio    │ ◄──────────────────────────► │  NestJS Server   │
│ Media Stream│         (mulaw 8kHz)         │    Gateway       │
└─────────────┘                              └──────────────────┘
                                                      │
                                                      │ WebSocket
                                                      │ (PCM16 24kHz)
                                                      ▼
                                              ┌──────────────────┐
                                              │  OpenAI Realtime │
                                              │       API        │
                                              └──────────────────┘
                                                      │
                                                      │ State
                                                      ▼
                                              ┌──────────────────┐
                                              │      Redis       │
                                              │   (Sessions)     │
                                              └──────────────────┘
```

### Key Components

1. **TwilioMediaStreamGateway** (`twilio-media-stream.gateway.ts`)
   - WebSocket handler for Twilio Media Streams
   - Receives mulaw audio (8kHz) from phone calls
   - Converts to PCM16 (24kHz) for OpenAI
   - Sends responses back to Twilio

2. **OpenAIRealtimeService** (`openai-realtime.service.ts`)
   - Manages WebSocket connections to OpenAI Realtime API
   - Handles audio streaming, transcription, and responses
   - Uses Sofia's system prompt for SDR conversations

3. **RealtimeSessionService** (`realtime-session.service.ts`)
   - Stores call state in Redis (distributed, scalable)
   - Tracks conversation transcripts
   - Manages session lifecycle

4. **AudioConverter** (`audio-converter.util.ts`)
   - Converts mulaw ↔ PCM16
   - Resamples 8kHz ↔ 24kHz
   - Base64 encoding/decoding

---

## 🚀 How to Use

### 1. Create a Realtime Call (API)

**Endpoint:** `POST /api/voice-calls/realtime`

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "toNumber": "+34612345678",
  "contactName": "María García",
  "businessName": "Salón Bella Vista",
  "metadata": {
    "source": "crm",
    "campaignId": "beauty-2024"
  }
}
```

**Response:**
```json
{
  "success": true,
  "mode": "realtime",
  "data": {
    "id": "uuid-here",
    "status": "initiated",
    "twilioCallSid": "CA123...",
    "toNumber": "+34612345678",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### 2. Call Flow

1. **Call Initiated** → Twilio dials the number
2. **Call Answered** → Twilio hits webhook `/webhook/realtime/incoming/:callId`
3. **TwiML Generated** → Server responds with `<Connect><Stream>` TwiML
4. **WebSocket Opens** → Twilio connects to `/api/voice-calls/media-stream`
5. **OpenAI Connects** → Server establishes WebSocket to OpenAI Realtime API
6. **Audio Streaming** → Bidirectional audio flows:
   - User speaks → Twilio → Server → OpenAI
   - OpenAI responds → Server → Twilio → User
7. **Call Ends** → Cleanup, save transcript to database

---

## 🔧 Configuration

### Environment Variables

Add to your `.env`:

```bash
# OpenAI (already configured)
OPENAI_API_KEY=sk-...

# Twilio (already configured)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_BASE_URL=https://yourdomain.com

# Redis (already configured via Docker)
REDIS_HOST=redis
REDIS_PORT=6379
```

### WebSocket URL

Ensure your `TWILIO_WEBHOOK_BASE_URL` is:
- ✅ HTTPS (required by Twilio Media Streams)
- ✅ Publicly accessible
- ✅ Points to your deployed server

**Example:** `https://api.nexora.app`

---

## 📊 Monitoring

### Check Active Sessions

```bash
# Via Redis CLI
docker exec -it nexora-redis redis-cli
> KEYS realtime:session:*
> GET realtime:session:CA123...
```

### View Logs

```bash
# All voice call logs
docker logs nexora-crm | grep -i "voice\|twilio\|openai\|realtime"

# WebSocket connections
docker logs nexora-crm | grep "Media Stream"

# OpenAI events
docker logs nexora-crm | grep "OpenAI event"
```

### Metrics

Each session stores:
- Call SID and Stream SID
- Full transcript (user + assistant)
- Timestamps for each turn
- Connection status

---

## 🧪 Testing

### 1. Local Testing (ngrok)

```bash
# Start ngrok
ngrok http 8000

# Update .env
TWILIO_WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io

# Restart service
docker compose restart crm
```

### 2. Test Call

```bash
curl -X POST http://localhost:8000/api/voice-calls/realtime \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toNumber": "+34612345678",
    "contactName": "Test User"
  }'
```

### 3. Monitor WebSocket

Open browser console on your deployed frontend:

```javascript
// Check WebSocket connection
const ws = new WebSocket('wss://yourdomain.com/api/voice-calls/media-stream');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (msg) => console.log('Message:', msg.data);
```

---

## 🔄 Migration from Legacy

### Gradual Rollout

1. **Keep Legacy Active**: Old endpoint `/api/voice-calls` still works
2. **Test Realtime**: Use `/api/voice-calls/realtime` for new calls
3. **Monitor Quality**: Compare transcripts, success rates, latency
4. **Migrate Fully**: Once confident, switch all traffic to realtime

### Feature Comparison

| Feature | Legacy (Gather) | Realtime (Media Streams) |
|---------|----------------|--------------------------|
| Latency | 2-3s | ~300ms |
| Interruptions | ❌ No | ✅ Yes |
| Audio Quality | Good | Excellent |
| Cost per call | $0.24-0.56 | $0.06-0.15 |
| Scalability | Limited | High (Redis) |
| Complexity | High | Low |

---

## 🐛 Troubleshooting

### Issue: WebSocket not connecting

**Check:**
1. Is Redis running? `docker ps | grep redis`
2. Is HTTPS enabled? Twilio requires WSS (not WS)
3. Firewall blocking WebSocket? Check security groups

### Issue: No audio in call

**Check:**
1. OpenAI API key valid? Test manually
2. Audio conversion working? Check logs for errors
3. Twilio Media Stream format? Should be mulaw, 8kHz

### Issue: High latency

**Check:**
1. Server location near Twilio region
2. OpenAI API region (use closest)
3. Redis latency (`redis-cli --latency`)

---

## 📚 API Reference

### POST `/api/voice-calls/realtime`

Creates a new realtime call using Media Streams + OpenAI Realtime API.

**Request:**
```typescript
interface CreateCallDto {
  toNumber: string;          // E.164 format: +34612345678
  contactName?: string;      // Optional contact name
  businessName?: string;     // Optional business name
  userId?: string;           // Optional user ID
  metadata?: Record<string, any>; // Optional metadata
}
```

**Response:**
```typescript
interface CallResponse {
  success: boolean;
  mode: 'realtime';
  data: {
    id: string;
    status: 'queued' | 'initiated' | 'ringing' | 'in-progress' | 'completed';
    twilioCallSid: string;
    toNumber: string;
    fromNumber: string;
    createdAt: string;
    metadata: Record<string, any>;
  };
}
```

---

## 🎯 Next Steps

1. ✅ **Test in staging**: Make test calls, verify quality
2. ✅ **Monitor costs**: Track OpenAI + Twilio spending
3. ✅ **Measure latency**: Compare before/after metrics
4. ✅ **Collect feedback**: How do users perceive the calls?
5. 🚀 **Scale up**: Once validated, migrate all traffic

---

## 📖 Additional Resources

- [Twilio Media Streams Docs](https://www.twilio.com/docs/voice/media-streams)
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [Redis Session Management](https://redis.io/docs/manual/patterns/session-management/)

---

## 🤝 Support

For questions or issues:
1. Check logs: `docker logs nexora-crm`
2. Test connectivity: `curl https://api.openai.com/v1/realtime`
3. Verify Twilio webhooks: Check Twilio Console → Debugger

---

**Built with ❤️ by the Nexora team**
