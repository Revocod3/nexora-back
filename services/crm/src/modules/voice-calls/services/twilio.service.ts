import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private client: twilio.Twilio;
  private fromNumber: string;
  private webhookBaseUrl: string;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER', '');
    this.webhookBaseUrl = this.configService.get<string>('TWILIO_WEBHOOK_BASE_URL', '');

    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
    }

    this.client = twilio.default(accountSid, authToken);
    this.logger.log(`Twilio service initialized with phone number: ${this.fromNumber}`);
  }

  /**
   * Initiate an outbound call
   */
  async makeCall(params: {
    to: string;
    callId: string;
    webhookUrl: string;
  }): Promise<{ sid: string; status: string }> {
    try {
      this.logger.log(`Initiating call to ${params.to} for callId: ${params.callId}`);

      const call = await this.client.calls.create({
        to: params.to,
        from: this.fromNumber,
        url: params.webhookUrl,
        statusCallback: `${this.webhookBaseUrl}/api/voice-calls/webhook/status/${params.callId}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        // Recording disabled to save costs (~$0.15-0.25/call)
        // Transcript is already saved in database from Speech-to-Text
        machineDetection: 'DetectMessageEnd',
        machineDetectionTimeout: 30,
        asyncAmd: 'true',
        asyncAmdStatusCallback: `${this.webhookBaseUrl}/api/voice-calls/webhook/amd/${params.callId}`,
        asyncAmdStatusCallbackMethod: 'POST',
      });

      this.logger.log(`Call initiated with SID: ${call.sid}`);

      return {
        sid: call.sid,
        status: call.status,
      };
    } catch (error: any) {
      this.logger.error(`Error making call: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate TwiML for speech gathering (using Gather)
   */
  generateGatherTwiML(params: {
    text: string;
    audioUrl?: string;
    actionUrl: string;
    timeout?: number;
    speechTimeout?: string;
  }): string {
    this.logger.log(`[TWIML-GEN] Generating Gather TwiML, audioUrl: ${params.audioUrl ? 'YES' : 'NO (using TTS)'}`);

    const twiml = new twilio.twiml.VoiceResponse();

    const gather = twiml.gather({
      input: ['speech'],
      action: params.actionUrl,
      method: 'POST',
      timeout: params.timeout || 5,
      speechTimeout: '2', // Changed from 'auto' to '2' seconds - 'auto' is not compatible with default model
      language: 'es-ES',
      enhanced: true,
      speechModel: 'phone_call', // Explicitly set model for better compatibility
    });

    if (params.audioUrl) {
      this.logger.log(`[TWIML-GEN] Using audio Play: ${params.audioUrl}`);
      gather.play(params.audioUrl);
    } else {
      this.logger.log(`[TWIML-GEN] Using TTS Say for text: "${params.text.substring(0, 50)}..."`);
      gather.say(
        {
          voice: 'Polly.Lucia',
          language: 'es-ES',
        },
        params.text
      );
    }

    // If no input is received, redirect
    twiml.redirect(params.actionUrl);

    const twimlString = twiml.toString();
    this.logger.debug(`[TWIML-GEN] Generated TwiML (${twimlString.length} chars): ${twimlString}`);

    return twimlString;
  }

  /**
   * Generate TwiML to play audio
   */
  generatePlayTwiML(audioUrl: string): string {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(audioUrl);
    return twiml.toString();
  }

  /**
   * Generate TwiML to speak text
   */
  generateSayTwiML(text: string): string {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      {
        voice: 'Polly.Lucia',
        language: 'es-ES',
      },
      text
    );
    return twiml.toString();
  }

  /**
   * Generate TwiML to hangup
   */
  generateHangupTwiML(finalMessage?: string): string {
    const twiml = new twilio.twiml.VoiceResponse();

    if (finalMessage) {
      twiml.say(
        {
          voice: 'Polly.Lucia',
          language: 'es-ES',
        },
        finalMessage
      );
    }

    twiml.hangup();
    return twiml.toString();
  }

  /**
   * Get call details
   */
  async getCall(callSid: string) {
    try {
      const call = await this.client.calls(callSid).fetch();
      return call;
    } catch (error: any) {
      this.logger.error(`Error fetching call ${callSid}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update call status
   */
  async updateCall(callSid: string, status: 'canceled' | 'completed') {
    try {
      const call = await this.client.calls(callSid).update({ status });
      return call;
    } catch (error: any) {
      this.logger.error(`Error updating call ${callSid}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recording URL (currently disabled to save costs)
   * Transcripts are saved in database instead
   */
  async getRecording(recordingSid: string): Promise<string> {
    this.logger.warn('Recording feature is disabled. Use conversation_transcript from database.');
    return '';
  }
}
