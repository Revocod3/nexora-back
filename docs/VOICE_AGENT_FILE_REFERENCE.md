# Voice Agent Implementation - File Reference Guide

## Quick Navigation

### Core Voice Module
```
/home/user/nexora-back/services/crm/src/modules/voice-calls/
├── voice-calls.controller.ts          [REST API endpoints]
├── voice-calls.service.ts             [Conversation orchestration]
├── voice-calls.module.ts              [NestJS module setup]
├── services/
│   ├── twilio.service.ts              [Twilio API + TwiML]
│   ├── conversation.service.ts        [OpenAI integration]
│   ├── elevenlabs.service.ts          [ElevenLabs TTS]
│   └── index.ts                       [Service exports]
└── dto/
    ├── create-call.dto.ts             [Call creation validation]
    ├── webhook.dto.ts                 [Webhook payload validation]
    └── index.ts                       [DTO exports]
```

### Data Models
```
/home/user/nexora-back/services/crm/src/entities/
├── call.entity.ts                     [Call record schema]
├── user.entity.ts                     [User schema (related)]
├── tenant.entity.ts                   [Tenant schema (related)]
├── base.entity.ts                     [Base timestamps]
└── index.ts                           [Entity exports]
```

### Agent Definitions
```
/home/user/nexora-back/services/crm/src/agents/
├── definitions/
│   └── salon-assistant.agent.ts       [Agent instructions (for future)]
└── tools/
    └── salon.tools.ts                 [Agent tools (for future)]
```

### Documentation
```
/home/user/nexora-back/docs/
├── VOICE_AGENT.md                     [Complete voice agent guide]
├── TEST_CREDENTIALS.md                [Testing guide]
├── API-CONTRACT.md                    [API specifications]
└── [other docs]
```

### Configuration
```
/home/user/nexora-back/
├── .env.example                       [Environment template]
├── services/crm/.env.example          [Service-specific template]
└── README.md                          [Project overview]
```

---

## Critical Code Sections

### 1. Call Initiation Flow (130 lines)
**File**: `voice-calls.service.ts:49-113`
```typescript
async createOutboundCall(tenantId: string, dto: CreateCallDto): Promise<Call> {
  // 1. Validate input & get tenant
  // 2. Create Call record (status: QUEUED)
  // 3. Initialize ConversationState
  // 4. Call TwilioService.makeCall()
  // 5. Update Call with Twilio SID (status: INITIATED)
}
```

### 2. Call Answered (Webhook 1)
**File**: `voice-calls.service.ts:119-168`
```typescript
async handleCallAnswered(callId: string): Promise<string> {
  // 1. Get initial message from ConversationService
  // 2. Add to conversation history
  // 3. Generate audio via ElevenLabs
  // 4. Generate TwiML with <Gather>
  // 5. Return XML to Twilio
}
```

### 3. User Response Processing (Webhook 2)
**File**: `voice-calls.service.ts:173-244`
```typescript
async handleUserResponse(callId: string, speechResult: string, turnNumber: number): Promise<string> {
  // 1. Get conversation state
  // 2. Check for end phrases
  // 3. Call OpenAI for response
  // 4. Check termination conditions (turns > 30, end phrase)
  // 5. If end: call endCall()
  // 6. Else: generate audio & TwiML with next <Gather>
}
```

### 4. Call Termination (Webhook 3)
**File**: `voice-calls.service.ts:249-295`
```typescript
async endCall(callId: string, finalMessage?: string): Promise<string> {
  // 1. Get conversation history
  // 2. Call ConversationService.analyzeCallOutcome()
  // 3. Classify outcome (qualified, not_interested, etc.)
  // 4. Calculate qualification_score
  // 5. Update database
  // 6. Return Hangup TwiML
}
```

### 5. Twilio Integration
**File**: `twilio.service.ts:29-63`
```typescript
async makeCall(params: { to: string; callId: string; webhookUrl: string }) {
  // Configure call with:
  // - URL: webhook when answered
  // - statusCallback: status updates
  // - machineDetection: AMD enabled
  // - asyncAmd: async voicemail detection
}
```

**File**: `twilio.service.ts:68-110`
```typescript
generateGatherTwiML(params) {
  // Creates:
  // <Gather input="speech" action="/webhook/response/{id}" timeout="5" ... >
  //   <Play>{audioUrl}</Play>
  // </Gather>
  // <Say>¿Sigues ahí?</Say>
}
```

### 6. OpenAI Conversation
**File**: `conversation.service.ts:143-198`
```typescript
async generateResponse(params: {
  conversationHistory: ConversationMessage[],
  userInput: string,
  context?: { contactName?: string; businessName?: string }
}): Promise<string> {
  // 1. Build enhanced system prompt with context
  // 2. Add conversation history
  // 3. Call OpenAI.chat.completions.create()
  // 4. Return response string (max 150 tokens)
}
```

**File**: `conversation.service.ts:203-246`
```typescript
async analyzeCallOutcome(conversationHistory) {
  // 1. Send conversation to OpenAI
  // 2. Request JSON response with: outcome, summary, qualificationScore
  // 3. Parse and return analysis
}
```

### 7. System Prompt (Sofia Agent)
**File**: `conversation.service.ts:27-126`
```
# 126-line prompt defining:
- Identity: Sofia, Nexora SDR for beauty salons
- Personality: Friendly, professional, consultative
- Voice: Natural Spanish, conversational
- Key Constraint: VERY BRIEF responses (2-3 sentences max, 1 question at a time)
- Flow: Intro → Discovery → Solution → Qualification → Next Steps
- Objection Handling: Cost, time, client preferences, existing systems
```

### 8. ElevenLabs TTS
**File**: `elevenlabs.service.ts:28-57`
```typescript
async textToSpeech(text: string, options?): Promise<Readable> {
  // 1. Call ElevenLabs API with:
  //    - voice: h2cd3gvcqTp3m65Dysk7 (Sofia's voice)
  //    - model: eleven_multilingual_v2
  //    - stability: 0.5
  //    - similarity_boost: 0.75
  // 2. Return readable stream
}
```

**File**: `elevenlabs.service.ts:62-76`
```typescript
async textToSpeechBuffer(text: string): Promise<Buffer> {
  // 1. Get audio stream
  // 2. Collect chunks
  // 3. Return complete buffer
}
```

**File**: `voice-calls.service.ts:383-407`
```typescript
private async generateAndUploadAudio(text, callId, turnNumber): Promise<string> {
  // 1. Generate audio buffer via ElevenLabs
  // 2. Save to /tmp/call_{callId}_turn_{turnNumber}.mp3
  // 3. Return public URL for Twilio to fetch
}
```

### 9. HTTP Endpoints

**File**: `voice-calls.controller.ts`

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/voice-calls` | POST | `createCall()` | Create outbound call |
| `/voice-calls` | GET | `getCalls()` | List calls for tenant |
| `/voice-calls/:id` | GET | `getCall()` | Get call details |
| `/voice-calls/webhook/incoming/:callId` | POST | `handleIncomingCall()` | Call answered |
| `/voice-calls/webhook/response/:callId` | POST | `handleResponse()` | User speech result |
| `/voice-calls/webhook/status/:callId` | POST | `handleStatus()` | Status update |
| `/voice-calls/webhook/recording/:callId` | POST | `handleRecording()` | Recording done (disabled) |
| `/voice-calls/webhook/amd/:callId` | POST | `handleAMD()` | AMD detection |
| `/voice-calls/audio/:fileName` | GET | `serveAudio()` | Audio file serving |

### 10. Data Models

**File**: `call.entity.ts:1-107`
```typescript
@Entity('calls')
class Call {
  id: UUID
  tenant_id: FK
  user_id: FK (nullable)
  direction: 'outbound' | 'inbound'
  status: CallStatus enum (queued, initiated, ringing, in-progress, completed, failed, etc.)
  twilio_call_sid: string
  from_number: string
  to_number: string
  started_at: timestamp
  ended_at: timestamp
  duration_seconds: integer
  conversation_transcript: JSONB (array of { role, content, timestamp })
  outcome: CallOutcome enum (qualified, not_interested, callback, voicemail, booked_demo)
  notes: text
  metadata: JSONB
  cost: float
  error_message: text
}
```

**File**: `create-call.dto.ts:1-28`
```typescript
class CreateCallDto {
  @IsUUID() userId?: string
  @IsPhoneNumber() toNumber: string
  @IsString() contactName: string
  @IsString() businessName?: string
  @IsObject() metadata?: Record<string, any>
}
```

---

## Key Variables & Constants

### Environment Variables (Required)
```bash
# Twilio (3 vars)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+34912345678
TWILIO_WEBHOOK_BASE_URL=https://your-domain.com

# OpenAI (2 vars)
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4o

# ElevenLabs (2 vars)
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_VOICE_ID=h2cd3gvcqTp3m65Dysk7
```

### Hardcoded Configuration

**Twilio Settings** (`twilio.service.ts`):
```typescript
voice: 'Polly.Lucia'         // TTS fallback voice
language: 'es-ES'            // Spanish
machineDetection: 'DetectMessageEnd'
asyncAmd: 'true'
```

**OpenAI Settings** (`conversation.service.ts`):
```typescript
model: 'gpt-4o'
temperature: 0.7
max_tokens: 150              // Keep responses short for voice
presence_penalty: 0.6        // Avoid repetition
frequency_penalty: 0.3
```

**ElevenLabs Settings** (`elevenlabs.service.ts`):
```typescript
model_id: 'eleven_multilingual_v2'
stability: 0.5               // 0-1 (higher = consistent)
similarity_boost: 0.75       // 0-1 (closeness to original)
```

**Twilio Gather Settings** (`twilio.service.ts`):
```typescript
input: ['speech']
timeout: 10 seconds (actually 5 in handleCallAnswered)
speechTimeout: 'auto'
language: 'es-ES'
enhanced: true               // Better STT model
```

### Conversation State
```typescript
// In-memory storage (voice-calls.service.ts:29)
private conversationStates = new Map<string, ConversationState>();

interface ConversationState {
  history: Array<{
    role: 'assistant' | 'user',
    content: string,
    timestamp: string
  }>;
  context: {
    contactName?: string;
    businessName?: string;
  };
}
```

### Max Limits
- **Max turns per call**: 30 (line 222 in voice-calls.service.ts)
- **Max tokens per response**: 150
- **Twilio timeout**: 10 seconds
- **Speech timeout**: auto (TwiML)

### Outcome Types
```typescript
enum CallOutcome {
  QUALIFIED = 'qualified',
  NOT_INTERESTED = 'not_interested',
  CALLBACK = 'callback',
  NO_ANSWER = 'no_answer',
  WRONG_NUMBER = 'wrong_number',
  VOICEMAIL = 'voicemail',
  BOOKED_DEMO = 'booked_demo',
}
```

### Call Status Types
```typescript
enum CallStatus {
  QUEUED = 'queued',
  INITIATED = 'initiated',
  RINGING = 'ringing',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BUSY = 'busy',
  NO_ANSWER = 'no-answer',
  CANCELED = 'canceled',
}
```

---

## Git History

```
8bf157b - fix: increase Gather timeout and add retry prompt for better call handling
7602c3a - fix: add Call entity to database and fix webhook URLs for voice calls
131f47c - Merge pull request #1 (voice-agent-elevenlabs)
cdb6f41 - refactor: disable Twilio call recording to optimize costs
e6d22f8 - feat: implement voice agent (Sofia SDR) with Twilio + OpenAI + ElevenLabs
```

---

## Dependencies Used

```json
{
  "twilio": "^4.x",          // Twilio SDK (calls, TwiML)
  "openai": "^4.x",          // OpenAI API (GPT-4o)
  "elevenlabs": "^1.x",      // ElevenLabs SDK (TTS)
  "@nestjs/common": "^10.x", // NestJS
  "@nestjs/config": "^3.x",  // Configuration
  "@nestjs/typeorm": "^10.x",// Database ORM
  "typeorm": "^0.3.x",       // TypeORM
  "class-validator": "^0.14.x", // DTO validation
}
```

---

## Testing

### Manual Call Test (from docs)
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

### Response Example
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

---

## Performance Metrics

- **Average Response Time**: 2-3 seconds per turn
  - STT: 1-2s
  - HTTP callback: 200-500ms
  - OpenAI: 500-1000ms
  - TTS: 1-2s
  - HTTP response: 100-200ms

- **Cost per Call**: $0.24-0.56 USD
  - Twilio: $0.03-0.15
  - OpenAI: $0.04-0.08
  - ElevenLabs: $0.17-0.33

- **Storage**: ~2-5 KB per turn (JSONB in PostgreSQL)

---

**Ready for migration to Twilio Media Streams + OpenAI Realtime API**
