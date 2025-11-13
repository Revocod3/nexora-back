import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private openai: OpenAI;
  private systemPrompt: string;
  private initialMessage: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.openai = new OpenAI({ apiKey });

    // System prompt para Sofía (agente SDR de Nexora)
    this.systemPrompt = `# Prompt Agente de Voz Nexora Salones

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

    this.initialMessage = 'Hola, soy Sofía de Nexora. Te llamo porque hemos ayudado a varios salones en tu zona a aumentar sus reservas hasta un 30% sin tener que contratar más personal. ¿Tienes unos minutos para contarte cómo?';

    this.logger.log('Conversation service initialized with Sofia agent prompt');
  }

  /**
   * Get the initial message for starting the conversation
   */
  getInitialMessage(): string {
    return this.initialMessage;
  }

  /**
   * Generate agent response based on conversation history
   */
  async generateResponse(params: {
    conversationHistory: ConversationMessage[];
    userInput: string;
    context?: {
      contactName?: string;
      businessName?: string;
    };
  }): Promise<string> {
    try {
      const { conversationHistory, userInput, context } = params;

      // Build context-aware system prompt
      let enhancedSystemPrompt = this.systemPrompt;
      if (context?.contactName) {
        enhancedSystemPrompt += `\n\n## Contexto de la llamada\nEstás hablando con ${context.contactName}`;
        if (context.businessName) {
          enhancedSystemPrompt += ` de ${context.businessName}`;
        }
        enhancedSystemPrompt += '.';
      }

      // Build messages array
      const messages: ConversationMessage[] = [
        { role: 'system', content: enhancedSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: userInput },
      ];

      this.logger.debug(
        `Generating response for user input: "${userInput.substring(0, 50)}..."`
      );

      // Call OpenAI
      const response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_MODEL', 'gpt-4o'),
        messages: messages as any,
        temperature: 0.7,
        max_tokens: 150, // Keep responses short
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
      });

      const assistantMessage = response.choices[0]?.message?.content?.trim() || '';

      if (!assistantMessage) {
        throw new Error('No response generated from OpenAI');
      }

      this.logger.debug(`Generated response: "${assistantMessage.substring(0, 50)}..."`);

      return assistantMessage;
    } catch (error: any) {
      this.logger.error(`Error generating response: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Analyze conversation to determine call outcome
   */
  async analyzeCallOutcome(conversationHistory: ConversationMessage[]): Promise<{
    outcome: 'qualified' | 'not_interested' | 'callback' | 'no_answer' | 'voicemail' | 'booked_demo';
    summary: string;
    qualificationScore: number;
  }> {
    try {
      const analysisPrompt = `Analiza la siguiente conversación de ventas y determina:
1. El resultado de la llamada (qualified/not_interested/callback/voicemail/booked_demo)
2. Un resumen breve de la conversación (2-3 oraciones)
3. Un score de cualificación de 0-100

Conversación:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Responde en formato JSON:
{
  "outcome": "qualified/not_interested/callback/voicemail/booked_demo",
  "summary": "resumen breve",
  "qualificationScore": 85
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');

      return {
        outcome: result.outcome || 'not_interested',
        summary: result.summary || 'No summary available',
        qualificationScore: result.qualificationScore || 0,
      };
    } catch (error: any) {
      this.logger.error(`Error analyzing call outcome: ${error.message}`);
      return {
        outcome: 'not_interested',
        summary: 'Error analyzing conversation',
        qualificationScore: 0,
      };
    }
  }

  /**
   * Detect if user wants to end the call
   */
  shouldEndCall(userInput: string): boolean {
    const endPhrases = [
      'adiós',
      'hasta luego',
      'tengo que irme',
      'no me interesa',
      'no gracias',
      'estoy ocupado',
      'ahora no puedo',
      'colgar',
      'terminar',
    ];

    const normalizedInput = userInput.toLowerCase().trim();
    return endPhrases.some(phrase => normalizedInput.includes(phrase));
  }
}
