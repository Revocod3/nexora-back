import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Call, CallStatus, CallDirection, CallOutcome, User, Tenant } from '../../entities';
import { ElevenLabsService } from './services/elevenlabs.service';
import { TwilioService } from './services/twilio.service';
import { ConversationService } from './services/conversation.service';
import { CreateCallDto } from './dto';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

interface ConversationState {
  history: Array<{
    role: 'assistant' | 'user';
    content: string;
    timestamp: string;
  }>;
  context: {
    contactName?: string;
    businessName?: string;
  };
}

@Injectable()
export class VoiceCallsService {
  private readonly logger = new Logger(VoiceCallsService.name);
  private conversationStates = new Map<string, ConversationState>();
  private webhookBaseUrl: string;

  constructor(
    @InjectRepository(Call)
    private callRepository: Repository<Call>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private elevenLabsService: ElevenLabsService,
    private twilioService: TwilioService,
    private conversationService: ConversationService,
    private configService: ConfigService,
  ) {
    this.webhookBaseUrl = this.configService.get<string>('TWILIO_WEBHOOK_BASE_URL', '');
    this.logger.log('VoiceCallsService initialized');
  }

  /**
   * Create and initiate an outbound call
   */
  async createOutboundCall(tenantId: string, dto: CreateCallDto): Promise<Call> {
    try {
      this.logger.log(`Creating outbound call to ${dto.toNumber}`);

      // Get tenant
      const tenant = { id: tenantId } as Tenant;

      // Get user if userId provided
      let user: User | undefined;
      if (dto.userId) {
        const foundUser = await this.userRepository.findOne({ where: { id: dto.userId } });
        if (!foundUser) {
          throw new NotFoundException(`User with ID ${dto.userId} not found`);
        }
        user = foundUser;
      }

      // Get from number from config
      const fromNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER', '');

      // Create call record
      const call = this.callRepository.create({
        tenant,
        user,
        direction: CallDirection.OUTBOUND,
        status: CallStatus.QUEUED,
        from_number: fromNumber,
        to_number: dto.toNumber,
        metadata: dto.metadata || {},
        conversation_transcript: [],
      });

      await this.callRepository.save(call);

      // Initialize conversation state
      this.conversationStates.set(call.id, {
        history: [],
        context: {
          contactName: dto.contactName,
          businessName: dto.businessName,
        },
      });

      // Initiate call via Twilio
      const webhookUrl = `${this.webhookBaseUrl}/api/voice-calls/webhook/incoming/${call.id}`;

      const twilioResult = await this.twilioService.makeCall({
        to: dto.toNumber,
        callId: call.id,
        webhookUrl,
      });

      // Update call with Twilio SID
      call.twilio_call_sid = twilioResult.sid;
      call.status = CallStatus.INITIATED;
      await this.callRepository.save(call);

      this.logger.log(`Outbound call created with ID: ${call.id}, Twilio SID: ${twilioResult.sid}`);

      return call;
    } catch (error: any) {
      this.logger.error(`Error creating outbound call: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handle incoming webhook when call is answered
   * Returns TwiML to start the conversation
   */
  async handleCallAnswered(callId: string): Promise<string> {
    try {
      this.logger.log(`Handling call answered for callId: ${callId}`);

      const call = await this.callRepository.findOne({ where: { id: callId } });
      if (!call) {
        throw new NotFoundException(`Call with ID ${callId} not found`);
      }

      // Get initial message from conversation service
      const initialMessage = this.conversationService.getInitialMessage();

      // Add to conversation history
      const state = this.conversationStates.get(callId);
      if (state) {
        state.history.push({
          role: 'assistant',
          content: initialMessage,
          timestamp: new Date().toISOString(),
        });
      }

      // Update call transcript
      call.conversation_transcript = state?.history || [];
      call.status = CallStatus.IN_PROGRESS;
      call.started_at = new Date();
      await this.callRepository.save(call);

      // Generate audio for initial message
      const audioUrl = await this.generateAndUploadAudio(initialMessage, callId, 0);

      // Generate TwiML with Gather for user response
      const actionUrl = `${this.webhookBaseUrl}/api/voice-calls/webhook/response/${callId}`;
      const twiml = this.twilioService.generateGatherTwiML({
        text: initialMessage,
        audioUrl,
        actionUrl,
        timeout: 5,
        speechTimeout: 'auto',
      });

      return twiml;
    } catch (error: any) {
      this.logger.error(`Error handling call answered: ${error.message}`, error.stack);
      // Return error TwiML
      return this.twilioService.generateHangupTwiML(
        'Lo siento, ha ocurrido un error. Intentaremos contactarte más tarde.'
      );
    }
  }

  /**
   * Handle user response and continue conversation
   */
  async handleUserResponse(callId: string, speechResult: string, turnNumber: number): Promise<string> {
    try {
      this.logger.log(`Handling user response for callId: ${callId}, turn: ${turnNumber}`);
      this.logger.debug(`User said: "${speechResult}"`);

      const call = await this.callRepository.findOne({ where: { id: callId } });
      if (!call) {
        throw new NotFoundException(`Call with ID ${callId} not found`);
      }

      const state = this.conversationStates.get(callId);
      if (!state) {
        throw new Error(`No conversation state found for callId: ${callId}`);
      }

      // Add user input to history
      state.history.push({
        role: 'user',
        content: speechResult,
        timestamp: new Date().toISOString(),
      });

      // Check if user wants to end call
      if (this.conversationService.shouldEndCall(speechResult)) {
        return await this.endCall(callId, 'Usuario terminó la llamada');
      }

      // Generate agent response using OpenAI
      const agentResponse = await this.conversationService.generateResponse({
        conversationHistory: state.history.map(h => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: h.content,
        })),
        userInput: speechResult,
        context: state.context,
      });

      // Add agent response to history
      state.history.push({
        role: 'assistant',
        content: agentResponse,
        timestamp: new Date().toISOString(),
      });

      // Update database
      call.conversation_transcript = state.history;
      await this.callRepository.save(call);

      // Check if we should end the call (max turns or goodbye detected in response)
      if (state.history.length > 30 || agentResponse.toLowerCase().includes('adiós') || agentResponse.toLowerCase().includes('hasta luego')) {
        return await this.endCall(callId, agentResponse);
      }

      // Generate audio for agent response
      const audioUrl = await this.generateAndUploadAudio(agentResponse, callId, turnNumber);

      // Generate TwiML with Gather for next user response
      const actionUrl = `${this.webhookBaseUrl}/api/voice-calls/webhook/response/${callId}?turn=${turnNumber + 1}`;
      const twiml = this.twilioService.generateGatherTwiML({
        text: agentResponse,
        audioUrl,
        actionUrl,
        timeout: 5,
        speechTimeout: 'auto',
      });

      return twiml;
    } catch (error: any) {
      this.logger.error(`Error handling user response: ${error.message}`, error.stack);
      return await this.endCall(callId, 'Lo siento, ha ocurrido un error. Gracias por tu tiempo.');
    }
  }

  /**
   * End call with final message
   */
  async endCall(callId: string, finalMessage?: string): Promise<string> {
    try {
      this.logger.log(`Ending call for callId: ${callId}`);

      const call = await this.callRepository.findOne({ where: { id: callId } });
      if (!call) {
        throw new NotFoundException(`Call with ID ${callId} not found`);
      }

      // Analyze conversation to determine outcome
      const state = this.conversationStates.get(callId);
      if (state && state.history.length > 2) {
        const analysis = await this.conversationService.analyzeCallOutcome(
          state.history.map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content,
          }))
        );

        call.outcome = analysis.outcome as CallOutcome;
        call.notes = analysis.summary;

        // Update user qualification score if user exists
        if (call.user) {
          call.user.qualification_score = analysis.qualificationScore;
        }
      }

      call.status = CallStatus.COMPLETED;
      call.ended_at = new Date();
      if (call.started_at) {
        call.duration_seconds = Math.floor(
          (call.ended_at.getTime() - call.started_at.getTime()) / 1000
        );
      }

      await this.callRepository.save(call);

      // Clean up conversation state
      this.conversationStates.delete(callId);

      return this.twilioService.generateHangupTwiML(finalMessage);
    } catch (error: any) {
      this.logger.error(`Error ending call: ${error.message}`, error.stack);
      return this.twilioService.generateHangupTwiML('Gracias por tu tiempo. Adiós.');
    }
  }

  /**
   * Update call status from Twilio webhook
   */
  async updateCallStatus(callId: string, status: string): Promise<void> {
    try {
      const call = await this.callRepository.findOne({ where: { id: callId } });
      if (!call) {
        this.logger.warn(`Call not found for status update: ${callId}`);
        return;
      }

      // Map Twilio status to our status
      const statusMap: Record<string, CallStatus> = {
        'queued': CallStatus.QUEUED,
        'initiated': CallStatus.INITIATED,
        'ringing': CallStatus.RINGING,
        'in-progress': CallStatus.IN_PROGRESS,
        'answered': CallStatus.IN_PROGRESS,
        'completed': CallStatus.COMPLETED,
        'busy': CallStatus.BUSY,
        'no-answer': CallStatus.NO_ANSWER,
        'failed': CallStatus.FAILED,
        'canceled': CallStatus.CANCELED,
      };

      call.status = statusMap[status] || call.status;

      await this.callRepository.save(call);
      this.logger.log(`Call ${callId} status updated to: ${status}`);
    } catch (error: any) {
      this.logger.error(`Error updating call status: ${error.message}`, error.stack);
    }
  }

  /**
   * Get call by ID
   */
  async getCall(callId: string): Promise<Call> {
    const call = await this.callRepository.findOne({
      where: { id: callId },
      relations: ['tenant', 'user'],
    });

    if (!call) {
      throw new NotFoundException(`Call with ID ${callId} not found`);
    }

    return call;
  }

  /**
   * Get calls for tenant
   */
  async getCallsForTenant(tenantId: string, options?: {
    limit?: number;
    offset?: number;
    status?: CallStatus;
  }): Promise<{ calls: Call[]; total: number }> {
    const queryBuilder = this.callRepository
      .createQueryBuilder('call')
      .leftJoinAndSelect('call.user', 'user')
      .where('call.tenant_id = :tenantId', { tenantId });

    if (options?.status) {
      queryBuilder.andWhere('call.status = :status', { status: options.status });
    }

    queryBuilder.orderBy('call.created_at', 'DESC');

    if (options?.limit) {
      queryBuilder.limit(options.limit);
    }

    if (options?.offset) {
      queryBuilder.offset(options.offset);
    }

    const [calls, total] = await queryBuilder.getManyAndCount();

    return { calls, total };
  }

  /**
   * Generate audio using ElevenLabs and return URL
   * For now, returns a simple file path - in production, upload to S3/CDN
   */
  private async generateAndUploadAudio(text: string, callId: string, turnNumber: number): Promise<string> {
    try {
      // Generate audio buffer
      const audioBuffer = await this.elevenLabsService.textToSpeechBuffer(text);

      // For now, save to temp directory
      // In production, upload to S3 or CDN
      const tempDir = os.tmpdir();
      const fileName = `call_${callId}_turn_${turnNumber}.mp3`;
      const filePath = path.join(tempDir, fileName);

      await fs.writeFile(filePath, audioBuffer);

      // Return public URL (this needs to be served by your server)
      const publicUrl = `${this.webhookBaseUrl}/voice-calls/audio/${fileName}`;

      this.logger.debug(`Audio generated and saved: ${publicUrl}`);

      return publicUrl;
    } catch (error: any) {
      this.logger.error(`Error generating audio: ${error.message}`);
      // Return empty string to fallback to Twilio TTS
      return '';
    }
  }
}
