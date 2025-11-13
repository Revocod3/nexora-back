# Voice Agent Implementation Analysis
## Current Architecture - Twilio + OpenAI + ElevenLabs (Gather-based STT/TTS)

**Date**: November 13, 2025
**Project**: Nexora - Voice Agent (Sofia SDR)
**Current Status**: Live with Gather TwiML pattern

---

## 1. CURRENT ARCHITECTURE OVERVIEW

### High-Level Flow
```
API Call (POST /voice-calls)
    ↓
Create Call Record (DB)
    ↓
Twilio Initiates Call → Phone Rings
    ↓
Call Answered → Webhook Trigger
    ↓
Generate Initial Message (OpenAI)
    ↓
Text-to-Speech (ElevenLabs) → MP3
    ↓
Play Audio + Gather Speech (TwiML)
    ↓
User Speaks → Twilio STT (built-in)
    ↓
Webhook with Speech Result
    ↓
Generate Response (OpenAI)
    ↓
Loop until conversation ends
    ↓
Analyze Call Outcome (OpenAI)
    ↓
Save Transcript & Update DB
```

### Key Design Pattern: **Request-Response Cycles**
- Each interaction requires a complete HTTP request/response cycle
- Twilio webhooks drive the conversation flow
- ~2-3 second latency per turn (best case)
- Limited natural conversation feel due to round-trip delays

---

## 2. TWILIO INTEGRATION

### Current Implementation: Gather + Play Pattern

**File**: `/home/user/nexora-back/services/crm/src/modules/voice-calls/services/twilio.service.ts`

#### Key Methods:
1. **`makeCall(params)`** - Initiates outbound call
   - Uses Twilio SDK to create call
   - Configures webhooks for status callbacks
   - Includes answering machine detection (AMD)
   - Status callback events: initiated, ringing, answered, completed
   ```typescript
   const call = await this.client.calls.create({
     to: params.to,
     from: this.fromNumber,
     url: params.webhookUrl,              // Webhook when call is answered
     statusCallback: statusCallbackUrl,   // Status updates
     statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
     machineDetection: 'DetectMessageEnd',
     asyncAmd: 'true',
     asyncAmdStatusCallback: amdCallbackUrl,
   });
   ```

2. **`generateGatherTwiML(params)`** - Creates TwiML for speech gathering
   - Uses `<Gather>` with `input="speech"`
   - Plays audio file OR text (if audio unavailable)
   - Waits for user speech with timeout
   - Redirects to webhook with speech result
   ```xml
   <Response>
     <Gather input="speech" action="/webhook/response/{callId}" method="POST" 
             timeout="10" speechTimeout="auto" language="es-ES" enhanced="true">
       <Play>https://example.com/audio.mp3</Play>
     </Gather>
     <Say>¿Sigues ahí? Por favor, responde.</Say>
     <Redirect>...</Redirect>
   </Response>
   ```

3. **Other TwiML Generators**:
   - `generatePlayTwiML()` - Simple audio playback
   - `generateSayTwiML()` - Text-to-speech using Polly
   - `generateHangupTwiML()` - End call with optional message

### Webhooks Flow:
1. **`/webhook/incoming/{callId}`** - Call answered
   - Generates initial message from OpenAI
   - Returns TwiML with Gather + ElevenLabs audio
   
2. **`/webhook/response/{callId}?turn=N`** - User response received
   - Receives `SpeechResult` parameter from Twilio STT
   - Processes conversation, generates next response
   - Returns TwiML with next Gather or Hangup

3. **`/webhook/status/{callId}`** - Status updates
   - Tracks call lifecycle (initiated → ringing → in-progress → completed)
   - Updates database

4. **`/webhook/amd/{callId}`** - Answering Machine Detection
   - Detects if human or voicemail answered
   - Currently just logs (not used for logic)

### Speech-to-Text (STT):
- **Provider**: Twilio built-in STT
- **Language**: Spanish (es-ES)
- **Enhancement**: `enhanced: true` (uses better model)
- **Result**: Passed as `SpeechResult` in webhook body

### Limitations:
- No control over STT confidence scores
- No real-time transcription
- Latency between speech end and webhook (~1-2 seconds)
- Limited accuracy for accents/background noise

---

## 3. OPENAI INTEGRATION

### Current Implementation: Request-Response Pattern

**File**: `/home/user/nexora-back/services/crm/src/modules/voice-calls/services/conversation.service.ts`

#### Key Methods:

1. **`generateResponse(params)`** - Main conversation generation
   ```typescript
   async generateResponse(params: {
     conversationHistory: ConversationMessage[],
     userInput: string,
     context?: { contactName?: string; businessName?: string }
   }): Promise<string>
   ```
   - Builds enhanced system prompt with context
   - Adds conversation history + user input
   - Calls GPT-4o with specific parameters:
     ```typescript
     {
       model: 'gpt-4o',
       messages: [system, ...history, user],
       temperature: 0.7,
       max_tokens: 150,        // Keep responses short for voice
       presence_penalty: 0.6,  // Avoid repetition
       frequency_penalty: 0.3
     }
     ```
   - Returns single string response

2. **`analyzeCallOutcome(conversationHistory)`** - End-of-call analysis
   ```typescript
   // Returns: { outcome, summary, qualificationScore }
   ```
   - Uses JSON response format
   - Classifies outcome: qualified | not_interested | callback | voicemail | booked_demo
   - Generates 2-3 sentence summary
   - Calculates qualification score (0-100)

3. **`shouldEndCall(userInput)`** - Detects end phrases
   - Pattern matching: "adiós", "hasta luego", "no me interesa", etc.

#### System Prompt (Sofia Agent):
**Location**: `ConversationService` constructor

**Key Characteristics**:
- Role: SDR (Sales Development Representative) for beauty salons in Spain
- Personality: Friendly, professional, consultative
- **CRITICAL CONSTRAINT**: "TODAS las respuestas deben ser MUY BREVES y CONVERSACIONALES"
  - Max 2-3 sentences per response
  - One question at a time
  - Simple, direct language
- Conversation flow:
  1. Introduction
  2. Discovery questions (salon size, reservation system, lost calls)
  3. Solution alignment (brief, focused)
  4. Qualification (3 key questions)
  5. Next steps (demo booking or end)

#### Full System Prompt (126 lines):
```
# Prompt Agente de Voz Nexora Salones

## Identidad y Propósito
Eres Sofía, asistente de ventas por voz de Nexora...

## Voz y Personalidad
- Suena amigable, profesional y genuinamente interesada
- Equilibra profesionalismo con cercanía y empatía
- Usa un tono conversacional natural con contracciones españolas
- Varía el ritmo, habla más pausadamente en puntos importantes

## IMPORTANTE: Respuestas Breves
- TODAS las respuestas deben ser MUY BREVES y CONVERSACIONALES
- Máximo 2-3 oraciones por respuesta
- Haz UNA pregunta a la vez
- Usa lenguaje simple y directo

## Flujo de Conversación
[Detailed conversation flow with intro, discovery, solution, qualification, next steps]

## Directrices de Respuesta
- NUNCA des respuestas largas o múltiples ideas juntas
- Haz UNA pregunta a la vez
- Reconoce y referencia respuestas previas
- Usa lenguaje afirmativo
- Evita jerga técnica

## Manejo de Objeciones
[Handles for: "Es muy caro", "No tengo tiempo", "Mis clientas prefieren personas", etc.]

## Base de Conocimiento
- Ideal client profile: 3+ professionals, 50+ weekly consultations
- Differentiation: Beauty-specific AI, Spanish integrations, quick implementation
- Pricing: 150-400€/month
```

#### Conversation State Management:
**Location**: `VoiceCallsService`

```typescript
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
- Stored in-memory (lost on service restart)
- Populated with conversation history
- Persisted to database at call end

### Limitations:
- In-memory storage (not production-ready for clustering)
- No streaming response (waits for full response)
- Fixed max_tokens (150) may cut off responses
- No function calling (tools) for dynamic responses
- Context limited to basic contact/business info

---

## 4. TEXT-TO-SPEECH (ElevenLabs) INTEGRATION

### Current Implementation: Buffer-based TTS

**File**: `/home/user/nexora-back/services/crm/src/modules/voice-calls/services/elevenlabs.service.ts`

#### Key Methods:

1. **`textToSpeech(text, options)`** - Generate audio stream
   ```typescript
   async textToSpeech(text: string, options?: {
     voiceId?: string;
     modelId?: string;
     stability?: number;
     similarityBoost?: number;
   }): Promise<Readable>
   ```
   - Calls ElevenLabs API with text
   - Default voice: `h2cd3gvcqTp3m65Dysk7` (Sofia's voice)
   - Default model: `eleven_multilingual_v2`
   - Voice settings:
     ```
     stability: 0.5           // 0-1 (higher = more consistent)
     similarity_boost: 0.75   // 0-1 (how close to original voice)
     ```
   - Returns readable stream

2. **`textToSpeechBuffer(text)`** - Buffer version
   - Collects stream chunks into Buffer
   - Returns complete audio as Buffer
   - Used for file storage

3. **`getVoices()`** - List available voices
   - Fetches all available ElevenLabs voices

#### Audio Storage Flow:
**Location**: `VoiceCallsService.generateAndUploadAudio()`

```typescript
// 1. Generate audio buffer
const audioBuffer = await this.elevenLabsService.textToSpeechBuffer(text);

// 2. Save to temp directory (NOT production-ready)
const tempDir = os.tmpdir();
const fileName = `call_${callId}_turn_${turnNumber}.mp3`;
const filePath = path.join(tempDir, fileName);
await fs.writeFile(filePath, audioBuffer);

// 3. Return public URL (served via /voice-calls/audio/:fileName endpoint)
const publicUrl = `${this.webhookBaseUrl}/voice-calls/audio/${fileName}`;
```

#### Audio Serving:
**Endpoint**: `GET /voice-calls/audio/:fileName`
- Streams file from OS temp directory
- Sets Content-Type: audio/mpeg
- Very basic, not suitable for production

### Characteristics:
- **Voice**: Sofia (predefined voice ID)
- **Language**: Spanish (auto-detected by model)
- **Quality**: High (multilingual v2 model)
- **Speed**: ~2-3 seconds per 150-200 characters
- **Format**: MP3 (Twilio compatible)

### Cost:
- Free tier: 10,000 characters/month
- Creator: $5/month - 30,000 characters
- Pro: $22/month - 100,000 characters

### Limitations:
- No streaming TTS (waits for full completion)
- Temp file storage (lost on restart, not scalable)
- No caching (regenerates audio for identical text)
- No support for SSML markup
- Stability/similarity tradeoff not optimized

---

## 5. MAIN SERVICE FILES & RESPONSIBILITIES

### File Structure:
```
services/crm/src/modules/voice-calls/
├── voice-calls.controller.ts      [HTTP endpoints & webhooks]
├── voice-calls.service.ts         [Orchestration & conversation flow]
├── voice-calls.module.ts          [NestJS module]
├── dto/
│   ├── create-call.dto.ts        [Request validation]
│   └── webhook.dto.ts            [Twilio webhook body]
└── services/
    ├── twilio.service.ts         [Twilio API integration]
    ├── conversation.service.ts   [OpenAI integration]
    ├── elevenlabs.service.ts     [ElevenLabs API integration]
    └── index.ts                  [Exports]

services/crm/src/entities/
└── call.entity.ts                [TypeORM Call entity]

services/crm/src/agents/
└── definitions/
    └── salon-assistant.agent.ts  [Agent instructions (for future)]
```

### VoiceCallsController
**Responsibilities**: HTTP routing, webhook handling, response formatting

**Endpoints**:
```
POST   /voice-calls                    [Create outbound call]
GET    /voice-calls                    [List calls with filters]
GET    /voice-calls/:id                [Get call details]
POST   /voice-calls/webhook/incoming/:callId    [When call answered]
POST   /voice-calls/webhook/response/:callId    [After user speaks]
POST   /voice-calls/webhook/status/:callId      [Status updates]
POST   /voice-calls/webhook/recording/:callId   [Recording done (disabled)]
POST   /voice-calls/webhook/amd/:callId         [AMD detection]
GET    /voice-calls/audio/:fileName   [Serve audio files]
```

### VoiceCallsService
**Responsibilities**: Orchestration, conversation flow, state management

**Key Methods**:
```
createOutboundCall()           [Initiate call via Twilio]
handleCallAnswered()           [Generate initial message & TwiML]
handleUserResponse()           [Process speech & generate response]
endCall()                      [Finalize call, analyze outcome]
updateCallStatus()             [Track call lifecycle]
getCall()                      [Retrieve call from DB]
getCallsForTenant()            [List calls with filters]
generateAndUploadAudio()       [Text → MP3 → URL]
```

### TwilioService
**Responsibilities**: Twilio SDK operations, TwiML generation

**Key Methods**:
```
makeCall()                     [Initiate call]
generateGatherTwiML()          [Create Gather TwiML]
generatePlayTwiML()            [Create Play TwiML]
generateSayTwiML()             [Create Say TwiML]
generateHangupTwiML()          [Create Hangup TwiML]
getCall()                      [Fetch call details]
updateCall()                   [Cancel/complete call]
getRecording()                 [Fetch recording URL (disabled)]
```

### ConversationService
**Responsibilities**: OpenAI integration, conversation logic, outcome analysis

**Key Methods**:
```
getInitialMessage()            [Return opening message]
generateResponse()             [Call OpenAI for response]
analyzeCallOutcome()           [Classify call result & score]
shouldEndCall()                [Detect end phrases]
```

### ElevenLabsService
**Responsibilities**: Text-to-speech generation

**Key Methods**:
```
textToSpeech()                 [Generate audio stream]
textToSpeechBuffer()           [Generate audio as buffer]
getVoices()                    [List available voices]
```

### Call Entity
**Responsibilities**: Data model for call records

**Fields**:
```
id                 UUID
tenant_id          FK to Tenant
user_id            FK to User (optional)
direction          'outbound' | 'inbound'
status             'queued' | 'initiated' | 'ringing' | 'in-progress' | 'completed' | ...
twilio_call_sid    Twilio call identifier
from_number        Source phone
to_number          Destination phone
started_at         Call start timestamp
ended_at           Call end timestamp
duration_seconds   Duration in seconds
conversation_transcript  JSONB array of messages
recording_url      URL to call recording (disabled)
outcome            'qualified' | 'not_interested' | 'callback' | 'voicemail' | 'booked_demo'
notes              Call analysis summary
metadata           Custom data (campaign, source, etc.)
cost               Estimated cost
error_message      Error details if failed
```

---

## 6. DETAILED CALL FLOW

### Complete Outbound Call Sequence:

#### Phase 1: Call Initiation (API)
```
1. POST /voice-calls
   - Body: { toNumber, contactName, businessName, userId?, metadata? }
   - Auth: JWT token required
   
2. VoiceCallsController.createCall()
   - Validates DTO
   - Calls VoiceCallsService.createOutboundCall()
   
3. VoiceCallsService.createOutboundCall()
   - Creates Call record: status = QUEUED
   - Saves to database
   - Initializes ConversationState (in-memory)
   - Calls TwilioService.makeCall()
   
4. TwilioService.makeCall()
   - Creates call via Twilio SDK
   - Sets webhook URL: /voice-calls/webhook/incoming/{callId}
   - Sets statusCallback: /voice-calls/webhook/status/{callId}
   - Enables AMD detection
   - Returns Twilio SID
   
5. Database Update
   - Updates Call: twilio_call_sid = SID, status = INITIATED
   - Response to client: { id, status: "initiated", twilio_call_sid }
   
6. Twilio Execution
   - Makes actual phone call
   - Phone rings
   - Status updates sent to webhook/status endpoint
```

#### Phase 2: Call Answered (Webhook)
```
7. Webhook Trigger: POST /webhook/incoming/{callId}
   - Twilio calls when call is answered
   - Body: { CallSid, To, From, CallStatus, etc. }
   
8. VoiceCallsController.handleIncomingCall()
   - Calls VoiceCallsService.handleCallAnswered()
   
9. VoiceCallsService.handleCallAnswered()
   a. Fetch Call from database
   b. ConversationService.getInitialMessage()
      - Returns: "Hola, soy Sofía de Nexora..."
   c. Add to ConversationState.history
   d. Update database: status = IN_PROGRESS, started_at = now
   e. generateAndUploadAudio(initialMessage)
      - ElevenLabsService.textToSpeechBuffer()
      - Save MP3 to /tmp
      - Return public URL
   f. TwilioService.generateGatherTwiML()
      - Creates XML with <Gather>
      - Includes audio Play
      - Timeout: 5 seconds
      - Action: /webhook/response/{callId}?turn=0
   g. Return TwiML as XML
   
10. Twilio Execution
    - Receives TwiML response
    - Plays audio
    - Waits for speech (listening state)
    - User speaks...
```

#### Phase 3: User Response (Webhook)
```
11. Webhook Trigger: POST /webhook/response/{callId}?turn=0
    - Twilio calls with speech result
    - Body: { CallSid, SpeechResult: "Hola, soy María", Digits, etc. }
    
12. VoiceCallsController.handleResponse()
    - Checks if SpeechResult is empty
    - If empty: return retry TwiML (ask again)
    - Otherwise: calls VoiceCallsService.handleUserResponse()
    
13. VoiceCallsService.handleUserResponse(callId, speechResult, turnNumber)
    a. Fetch Call from database
    b. Get ConversationState
    c. Add to history: { role: 'user', content: speechResult, timestamp }
    d. ConversationService.shouldEndCall(speechResult)
       - If user said "adiós", "no me interesa", etc. → endCall()
    e. ConversationService.generateResponse()
       - Build messages: [system, ...history, user]
       - Call OpenAI.chat.completions.create()
       - Example: system_prompt + conversation + "Hola, soy María"
       - Returns: "Perfecto María, ¿cuántas personas trabajan en tu salón?"
    f. Add to history: { role: 'assistant', content: agentResponse }
    g. Update database: conversation_transcript = history
    h. Check termination conditions:
       - history.length > 30 (max turns)
       - response includes "adiós" or "hasta luego"
       - If yes: call endCall()
    i. generateAndUploadAudio(agentResponse)
    j. TwilioService.generateGatherTwiML() for next turn
       - Action: /webhook/response/{callId}?turn=1
    k. Return TwiML
    
14. Twilio Execution
    - Receives TwiML
    - Plays audio
    - Waits for speech
    - Loop back to step 11
```

#### Phase 4: Call Termination
```
15. Termination Triggered
    - User says goodbye phrase
    - Max turns reached (30)
    - Agent says "adiós" in response
    - Error occurs
    
16. VoiceCallsService.endCall(callId, finalMessage)
    a. Fetch Call from database
    b. Get ConversationState
    c. ConversationService.analyzeCallOutcome()
       - Send conversation to OpenAI
       - Get: outcome, summary, qualificationScore
       - Example outcome: "qualified"
       - Example summary: "Salón con 5 empleados, interesado en demo..."
       - Example score: 85/100
    d. Update Call:
       - status = COMPLETED
       - outcome = qualified
       - notes = summary
       - ended_at = now
       - duration_seconds = (ended_at - started_at) / 1000
       - user.qualification_score = score (if user exists)
    e. Save to database
    f. Delete ConversationState from memory
    g. TwilioService.generateHangupTwiML(finalMessage)
       - "Muchas gracias por tu tiempo. ¡Que tengas un gran día!"
    h. Return TwiML
    
17. Twilio Execution
    - Receives TwiML
    - Says final message
    - Hangups call
    
18. Status Webhook (Automatic)
    - POST /webhook/status/{callId}
    - Body: { CallStatus: "completed", CallDuration: "245", ... }
    - VoiceCallsService.updateCallStatus()
    - Update database: status = COMPLETED (already set)
```

#### Phase 5: Retrieval (API)
```
19. GET /voice-calls/{callId}
    - VoiceCallsController.getCall()
    - Fetch from database with relations
    - Return:
      {
        id: "call-uuid",
        status: "completed",
        duration_seconds: 245,
        outcome: "qualified",
        conversation_transcript: [
          { role: "assistant", content: "Hola, soy Sofía...", timestamp: "..." },
          { role: "user", content: "Hola, soy María", timestamp: "..." },
          ...
        ],
        notes: "Salón con 5 empleados...",
        qualification_score: 85
      }
```

---

## 7. KEY CHARACTERISTICS & LIMITATIONS

### Strengths:
1. **Simple Architecture**: Easy to understand request-response flow
2. **Proven Pattern**: Twilio Gather is well-documented and reliable
3. **Database Persistence**: Full conversation history saved
4. **Outcome Analysis**: Automatic call classification and scoring
5. **Cost Effective**: Estimated $0.30-0.50 per call
6. **Flexible Prompting**: Easy to modify agent behavior via system prompt
7. **Multi-turn Conversation**: Handles extended dialogues (up to 30 turns)
8. **Webhook Reliability**: Status tracking for all call events
9. **Authentication**: JWT protected endpoints
10. **Multi-tenant**: Tenant isolation via database

### Limitations:

#### 1. Latency Issues
- Round-trip time per turn: 2-3 seconds (best case)
- Broken into:
  - Speech recognition end-to-end: ~1-2s
  - HTTP webhook callback: ~200-500ms
  - OpenAI generation: ~500-1000ms
  - TTS generation: ~1-2s
  - HTTP response to Twilio: ~100-200ms
- **Result**: Conversation feels unnatural, lots of silence

#### 2. STT Limitations
- Twilio built-in STT with no confidence scores
- No access to alternatives (n-best hypotheses)
- No control over sensitivity/thresholds
- Limited accuracy for Spanish accents/dialects
- 10-second timeout before timeout message played
- No real-time partial results

#### 3. TTS Limitations
- ElevenLabs API calls are sequential (no pipelining)
- Audio files stored in /tmp (not persistent)
- No audio caching (regenerates for same text)
- ~2-3 second generation time per turn
- No SSML support for prosody control
- No streaming audio playback (full download required)

#### 4. Conversation Flow Issues
- No interruption handling (user must wait for audio to finish)
- Max 30 turns hard limit (arbitrary)
- In-memory conversation state (lost on restart)
- No conversation recovery if webhook fails
- HTTP timeout issues can break conversation mid-flow

#### 5. Infrastructure
- Audio files in OS temp directory (not production-ready)
- Audio serving via simple file stream (not scalable)
- No CDN for audio delivery
- No load balancing for concurrent calls
- No database connection pooling shown

#### 6. OpenAI Integration
- No function calling (tools/actions)
- No structured outputs
- No vision capabilities (could use audio preprocessing)
- Fixed max_tokens (150) may truncate important info
- No streaming responses (waits for full completion)
- No token counting/cost tracking

#### 7. Error Handling
- Minimal retry logic
- No graceful degradation (hard failures)
- Limited error messages returned to client
- No circuit breaker pattern
- AMD detection hooks installed but not used

#### 8. Analytics & Monitoring
- No real-time metrics/dashboards
- No sentiment analysis
- No conversation quality scoring
- Limited logging configuration
- No performance tracing

#### 9. State Management
- Conversation state map can grow unbounded
- No garbage collection for abandoned calls
- Memory leak risk if webhooks don't fire
- No distributed tracing
- Single-instance only (not clusterable)

---

## 8. TECHNOLOGY STACK

### Dependencies:
```typescript
{
  "@nestjs/common": "^10.x",
  "@nestjs/config": "^3.x",
  "@nestjs/typeorm": "^10.x",
  "typeorm": "^0.3.x",
  "class-validator": "^0.14.x",
  "openai": "^4.x",           // GPT-4o calls
  "twilio": "^4.x",           // Twilio SDK
  "elevenlabs": "^1.x",       // ElevenLabs SDK
}
```

### Environment Variables:
```
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+34912345678
TWILIO_WEBHOOK_BASE_URL=https://your-domain.com

# OpenAI
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4o

# ElevenLabs
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_VOICE_ID=h2cd3gvcqTp3m65Dysk7
```

---

## 9. COST BREAKDOWN (per call estimate)

### Twilio
- Outbound call: ~$0.01-0.05/minute
- Speech recognition: ~$0.00-0.02/minute (included in call)
- 3-minute call: ~$0.03-0.15

### ElevenLabs
- ~150 chars per turn × 5-10 turns = 750-1500 chars
- Pro plan: 100,000 chars/month = $22
- Cost per 1000 chars: $0.22
- Per call: ~$0.17-0.33

### OpenAI GPT-4o
- Input: $2.50/1M tokens
- Output: $10/1M tokens
- ~5-10 turns × 150 tokens = 1500-2000 tokens
- Per call: ~$0.04-0.08

### **Total per call**: $0.24-0.56 USD (~$0.22-0.51 EUR)

---

## 10. MIGRATION PREPARATION NOTES

### For Media Streams + Realtime API:
1. **Keep**: Call entity schema, authentication, API endpoints, database layer
2. **Replace**: TwilioService (from REST to WebSocket), ConversationService (add streaming)
3. **Add**: WebSocket handler, audio encoding/decoding, real-time message routing
4. **Remove**: ElevenLabsService (use OpenAI's native TTS), temporary file storage
5. **Change**: Conversation state to Redis (distributed), add reconnection logic

### Code Impact:
- TwilioService: ~70% rewrite (Media Streams WebSocket)
- ConversationService: ~40% rewrite (streaming responses)
- ElevenLabsService: Delete (use OpenAI TTS)
- VoiceCallsService: ~20% changes (async flow changes)
- VoiceCallsController: Mostly same, add WebSocket endpoint

### Database Changes:
- No schema changes needed
- Could add: `media_stream_session_id`, `realtime_session_token`
- Could optimize: conversation_transcript storage strategy

---

## 11. FILES SUMMARY TABLE

| File | Lines | Purpose | Key Functions |
|------|-------|---------|----------------|
| `voice-calls.controller.ts` | 256 | HTTP routes & webhooks | createCall, handleIncoming, handleResponse, handleStatus |
| `voice-calls.service.ts` | 409 | Orchestration | createOutboundCall, handleCallAnswered, handleUserResponse, endCall |
| `twilio.service.ts` | 191 | Twilio API | makeCall, generateGatherTwiML, generateHangupTwiML |
| `conversation.service.ts` | 268 | OpenAI integration | generateResponse, analyzeCallOutcome, shouldEndCall |
| `elevenlabs.service.ts` | 91 | Text-to-speech | textToSpeechBuffer, textToSpeech, getVoices |
| `call.entity.ts` | 107 | Data model | Call entity with all fields |
| `create-call.dto.ts` | 28 | Request validation | CreateCallDto |
| `webhook.dto.ts` | 35 | Webhook parsing | TwilioWebhookDto |
| `voice-calls.module.ts` | 26 | Module setup | Imports, providers, exports |

**Total**: ~1,411 lines of TypeScript code

---

## 12. DEPLOYMENT CHECKLIST

### Prerequisites:
- [ ] Twilio account with purchased phone number
- [ ] OpenAI API key with GPT-4o access
- [ ] ElevenLabs account with API key
- [ ] Public HTTPS domain (for webhooks)
- [ ] PostgreSQL database
- [ ] Redis (optional, for session management)

### Configuration:
- [ ] Set all 7 environment variables
- [ ] Configure webhook URL (must be HTTPS)
- [ ] Create Call table via migrations
- [ ] Set up JWT authentication
- [ ] Configure CORS for frontend

### Testing:
- [ ] Make test call to own phone
- [ ] Verify speech recognition working
- [ ] Check database records saved
- [ ] Validate TwiML generation
- [ ] Test error scenarios

---

**End of Analysis**
