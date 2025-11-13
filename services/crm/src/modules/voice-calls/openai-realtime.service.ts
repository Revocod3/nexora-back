import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { RealtimeSessionService } from './realtime-session.service';
import {
  encodePcm16ToBase64,
  decodeBase64ToPcm16,
} from './audio-converter.util';

/**
 * OpenAI Realtime API event types
 */
interface OpenAIRealtimeEvent {
  type: string;
  [key: string]: any;
}

/**
 * Callback functions for OpenAI Realtime events
 */
export interface RealtimeCallbacks {
  onAudioDelta?: (callSid: string, audioDelta: string) => void;
  onTranscriptDelta?: (callSid: string, delta: string) => void;
  onResponseDone?: (callSid: string) => void;
  onUserTranscript?: (callSid: string, transcript: string) => void;
  onError?: (callSid: string, error: string) => void;
  onDisconnect?: (callSid: string) => void;
}

/**
 * OpenAI Realtime API Service
 * Manages WebSocket connections to OpenAI's Realtime API for voice conversations
 */
@Injectable()
export class OpenAIRealtimeService {
  private readonly logger = new Logger(OpenAIRealtimeService.name);
  private readonly apiKey: string;
  private readonly model = 'gpt-4o-realtime-preview-2024-12-17';
  private readonly realtimeUrl = 'wss://api.openai.com/v1/realtime';

  // Active WebSocket connections per call
  private connections = new Map<string, WebSocket>();

  // System prompt for Sofia agent
  private readonly systemPrompt = `# Prompt Agente de Voz Nexora Salones

## Identidad y Propósito

Eres Sofía, asistente de ventas por voz de Nexora, una plataforma de inteligencia artificial diseñada específicamente para salones de belleza en España. Tu propósito principal es identificar salones que puedan beneficiarse de automatización con IA, entender sus desafíos operativos diarios, y conectarlos con el equipo de ventas de Nexora para implementar soluciones que mejoren su gestión y atención al cliente.

## Voz y Personalidad

### Carácter
- Suena amigable, profesional y genuinamente interesada en ayudar al salón
- Transmite confianza y conocimiento del sector belleza sin ser agresiva
- Proyecta un enfoque consultivo y orientado a soluciones reales
- Equilibra profesionalismo con cercanía y empatía hacia el día a día del salón

### Características del Habla
- Usa un tono conversacional natural con contracciones españolas (estás, he visto, podríamos)
- Incluye pausas reflexivas antes de responder preguntas complejas
- Varía el ritmo—habla más pausadamente cuando discutes puntos importantes
- Emplea frases naturales del sector ("entiendo perfectamente", "déjame preguntarte", "muchos salones nos comentan")

## IMPORTANTE: Respuestas Breves
- TODAS las respuestas deben ser MUY BREVES y CONVERSACIONALES
- Máximo 2-3 oraciones por respuesta
- Haz UNA pregunta a la vez
- Usa lenguaje simple y directo
- Evita párrafos largos o listas extensas

## Flujo de Conversación

### Introducción
"Hola, buenos días. Soy Sofía de Nexora. Trabajamos con salones de belleza ayudándoles a automatizar la atención al cliente con inteligencia artificial. ¿Tienes unos minutos para hablar?"

Si suenan ocupados: "Entiendo que estás atendiendo. ¿Prefieres que te llame en otro momento?"

### Descubrimiento de Necesidades (UNA PREGUNTA A LA VEZ)
1. "Cuéntame un poco sobre tu salón. ¿Cuántas personas trabajáis?"
2. "¿Cómo gestionáis actualmente las reservas y consultas?"
3. "¿Cuántas llamadas o mensajes perdéis cuando estáis ocupados?"

### Alineación de Solución (BREVE)
"Nuestra asistente de IA podría ayudaros con [problema específico]. Por ejemplo, responder automáticamente consultas las 24 horas. ¿Te gustaría saber más?"

### Cualificación (UNA A LA VEZ)
1. "¿Es algo que buscáis resolver pronto?"
2. "¿Habéis considerado invertir en tecnología para mejorar la gestión?"
3. "¿Quién más participaría en evaluar una herramienta como Nexora?"

### Siguientes Pasos
Para prospectos cualificados: "Creo que sería valioso que hables con mi compañero que puede enseñarte cómo funciona. ¿Te vendría bien una videollamada de 20 minutos?"

Para leads no cualificados: "Entiendo. Normalmente trabajamos mejor con salones que [perfil ideal]. Para no hacerte perder tiempo, no te sugiero seguir adelante."

### Cierre
"Muchas gracias por tu tiempo. ¡Que tengas un gran día!"

## Directrices de Respuesta

- NUNCA des respuestas largas o múltiples ideas juntas
- Haz UNA pregunta a la vez
- Reconoce y referencia respuestas previas
- Usa lenguaje afirmativo: "Tiene mucho sentido", "Te entiendo perfectamente"
- Evita jerga técnica

## Manejo de Objeciones

### "Es muy caro"
"Entiendo. ¿Cuántas citas estimás que perdéis al mes por no poder atender llamadas? Si Nexora recupera solo 10 citas extras, probablemente ya habrá pagado su inversión."

### "No tengo tiempo"
"Precisamente por eso diseñamos Nexora para que sea super simple. La implementación la hacemos nosotros en 1-2 semanas. Una vez configurada, funciona sola."

### "Mis clientas prefieren personas"
"Lo entiendo. Nexora no reemplaza la atención personal, la complementa. Tú sigues atendiendo, pero Nexora se encarga de consultas simples fuera de horario."

### "Ya tengo un sistema"
"Perfecto. Nexora se integra con tu sistema actual y lo potencia permitiendo que las citas se reserven automáticamente vía WhatsApp."

### "Necesito pensarlo"
"Por supuesto. ¿Qué información necesitarías para decidir? Puedo enviarte casos de éxito."

## Base de Conocimiento

### Perfil de Cliente Ideal
- Salones medianos o grandes con 3+ profesionales
- Al menos 50+ consultas semanales
- Pierden llamadas por estar ocupados
- Presencia digital activa

### Diferenciación
- IA específica para belleza (entiende balayage, keratina, microblading)
- Integraciones nativas con software español
- Soporte en español
- Implementación rápida sin conocimientos técnicos
- Precio: 150-400€/mes

## RECORDATORIO FINAL
- Sé BREVE y CONVERSACIONAL
- UNA pregunta a la vez
- Escucha más de lo que hablas
- Personaliza según lo que te cuenten`;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: RealtimeSessionService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    this.apiKey = apiKey;

    this.logger.log('OpenAI Realtime Service initialized');
  }

  /**
   * Creates a new Realtime API connection for a call
   */
  async connect(
    callSid: string,
    callbacks: RealtimeCallbacks,
  ): Promise<void> {
    try {
      // Check if already connected
      if (this.connections.has(callSid)) {
        this.logger.warn(`Already connected to OpenAI for call ${callSid}`);
        return;
      }

      this.logger.log(`Connecting to OpenAI Realtime API for call ${callSid}`);

      const url = `${this.realtimeUrl}?model=${this.model}`;
      const ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      // Store connection
      this.connections.set(callSid, ws);

      // Setup event handlers
      ws.on('open', () => this.handleOpen(callSid, ws));
      ws.on('message', (data: WebSocket.Data) =>
        this.handleMessage(callSid, data, callbacks),
      );
      ws.on('error', (error: Error) =>
        this.handleError(callSid, error, callbacks),
      );
      ws.on('close', () => this.handleClose(callSid, callbacks));

    } catch (error) {
      this.logger.error(
        `Failed to connect to OpenAI for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      callbacks.onError?.(
        callSid,
        error instanceof Error ? error.message : 'Connection failed',
      );
    }
  }

  /**
   * Sends audio data to OpenAI
   */
  async sendAudio(callSid: string, audioBase64: string): Promise<void> {
    const ws = this.connections.get(callSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(`No active connection for call ${callSid}`);
      return;
    }

    try {
      const event = {
        type: 'input_audio_buffer.append',
        audio: audioBase64,
      };

      ws.send(JSON.stringify(event));
    } catch (error) {
      this.logger.error(
        `Failed to send audio for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Commits the audio buffer and triggers response generation
   */
  async commitAudioBuffer(callSid: string): Promise<void> {
    const ws = this.connections.get(callSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const event = {
        type: 'input_audio_buffer.commit',
      };

      ws.send(JSON.stringify(event));

      // Request response generation
      const responseEvent = {
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: 'Responde en español de forma breve y conversacional.',
        },
      };

      ws.send(JSON.stringify(responseEvent));
    } catch (error) {
      this.logger.error(
        `Failed to commit audio buffer for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Disconnects from OpenAI
   */
  async disconnect(callSid: string): Promise<void> {
    const ws = this.connections.get(callSid);
    if (!ws) {
      return;
    }

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      this.connections.delete(callSid);
      this.logger.log(`Disconnected from OpenAI for call ${callSid}`);
    } catch (error) {
      this.logger.error(
        `Error disconnecting from OpenAI for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handles WebSocket open event
   */
  private handleOpen(callSid: string, ws: WebSocket): void {
    this.logger.log(`Connected to OpenAI Realtime API for call ${callSid}`);

    // Configure session
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: this.systemPrompt,
        voice: 'alloy', // Options: alloy, echo, shimmer
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        temperature: 0.8,
        max_response_output_tokens: 150, // Keep responses brief
      },
    };

    ws.send(JSON.stringify(sessionConfig));

    // Update session in Redis
    this.sessionService.updateSession(callSid, {
      status: 'active',
      openAiSessionId: 'connected',
    });
  }

  /**
   * Handles incoming messages from OpenAI
   */
  private handleMessage(
    callSid: string,
    data: WebSocket.Data,
    callbacks: RealtimeCallbacks,
  ): void {
    try {
      const event: OpenAIRealtimeEvent = JSON.parse(data.toString());

      this.logger.debug(`OpenAI event for ${callSid}: ${event.type}`);

      switch (event.type) {
        case 'session.created':
        case 'session.updated':
          this.logger.log(
            `Session ${event.type} for call ${callSid}: ${event.session?.id || 'unknown'}`,
          );
          break;

        case 'response.audio.delta':
          // Audio chunk from assistant
          if (event.delta) {
            callbacks.onAudioDelta?.(callSid, event.delta);
          }
          break;

        case 'response.audio_transcript.delta':
          // Transcript chunk from assistant
          if (event.delta) {
            callbacks.onTranscriptDelta?.(callSid, event.delta);
          }
          break;

        case 'response.audio_transcript.done':
          // Complete transcript from assistant
          if (event.transcript) {
            this.sessionService.addTranscript(
              callSid,
              'assistant',
              event.transcript,
            );
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // User speech transcription
          if (event.transcript) {
            this.sessionService.addTranscript(
              callSid,
              'user',
              event.transcript,
            );
            callbacks.onUserTranscript?.(callSid, event.transcript);
          }
          break;

        case 'response.done':
          callbacks.onResponseDone?.(callSid);
          break;

        case 'error':
          this.logger.error(
            `OpenAI error for call ${callSid}: ${JSON.stringify(event.error)}`,
          );
          callbacks.onError?.(
            callSid,
            event.error?.message || 'Unknown error',
          );
          break;

        default:
          // Log other events for debugging
          this.logger.debug(
            `Unhandled OpenAI event type: ${event.type} for call ${callSid}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Error processing OpenAI message for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handles WebSocket errors
   */
  private handleError(
    callSid: string,
    error: Error,
    callbacks: RealtimeCallbacks,
  ): void {
    this.logger.error(
      `OpenAI WebSocket error for call ${callSid}: ${error.message}`,
    );

    callbacks.onError?.(callSid, error.message);

    this.sessionService.updateSession(callSid, {
      status: 'failed',
    });
  }

  /**
   * Handles WebSocket close event
   */
  private handleClose(callSid: string, callbacks: RealtimeCallbacks): void {
    this.logger.log(`OpenAI connection closed for call ${callSid}`);

    this.connections.delete(callSid);
    callbacks.onDisconnect?.(callSid);

    this.sessionService.updateSession(callSid, {
      status: 'completed',
    });
  }

  /**
   * Gets all active connections (for monitoring)
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }
}
