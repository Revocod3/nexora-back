import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'ws';
import { IncomingMessage } from 'http';
import { RealtimeSessionService } from './realtime-session.service';
import { OpenAIRealtimeService } from './openai-realtime.service';
import {
  twilioToOpenAI,
  openAIToTwilio,
  encodePcm16ToBase64,
  decodeBase64ToPcm16,
} from './audio-converter.util';
import * as WebSocket from 'ws';

interface TwilioWebSocket extends WebSocket {
  callSid?: string;
  streamSid?: string;
  isAlive?: boolean;
}

interface TwilioMediaEvent {
  event: string;
  sequenceNumber?: string;
  streamSid?: string;
  callSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
    customParameters?: Record<string, string>;
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string;
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
}

/**
 * WebSocket Gateway for Twilio Media Streams
 * Receives audio from Twilio, forwards to OpenAI Realtime API, and sends responses back
 */
@WebSocketGateway({
  path: '/api/voice-calls/media-stream',
  transports: ['websocket'],
  adapter: require('@nestjs/platform-ws').WsAdapter,
})
export class TwilioMediaStreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TwilioMediaStreamGateway.name);

  // Buffer for accumulating audio chunks before sending to OpenAI
  private audioBuffers = new Map<string, Buffer[]>();

  // Mark for tracking if we've sent audio to OpenAI
  private hasAudioSent = new Map<string, boolean>();

  constructor(
    private readonly sessionService: RealtimeSessionService,
    private readonly openAIService: OpenAIRealtimeService,
  ) {
    this.logger.log('Twilio Media Stream Gateway initialized');
  }

  /**
   * Handles new WebSocket connections from Twilio
   */
  async handleConnection(client: TwilioWebSocket, request: IncomingMessage) {
    this.logger.log(
      `New Twilio Media Stream connection from ${request.socket.remoteAddress}`,
    );

    client.isAlive = true;

    // Setup heartbeat
    client.on('pong', () => {
      client.isAlive = true;
    });

    // Setup message handler for native WebSocket
    client.on('message', async (data: WebSocket.Data) => {
      await this.handleMessageRaw(client, data);
    });
  }

  /**
   * Handles WebSocket disconnections
   */
  async handleDisconnect(client: TwilioWebSocket) {
    const callSid = client.callSid;

    if (callSid) {
      this.logger.log(`Twilio Media Stream disconnected for call ${callSid}`);

      // Cleanup
      await this.cleanup(callSid);
    }
  }

  /**
   * Handles raw WebSocket messages from Twilio
   */
  private async handleMessageRaw(client: TwilioWebSocket, data: WebSocket.Data) {
    try {
      const payload = data.toString();
      const event: TwilioMediaEvent = JSON.parse(payload);

      switch (event.event) {
        case 'start':
          await this.handleStart(client, event);
          break;

        case 'media':
          await this.handleMedia(client, event);
          break;

        case 'stop':
          await this.handleStop(client, event);
          break;

        default:
          this.logger.debug(`Unhandled Twilio event: ${event.event}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling Twilio message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handles messages from Twilio Media Stream (kept for compatibility)
   */
  @SubscribeMessage('message')
  async handleMessage(client: TwilioWebSocket, payload: string) {
    await this.handleMessageRaw(client, Buffer.from(payload));
  }

  /**
   * Handles the 'start' event from Twilio
   */
  private async handleStart(
    client: TwilioWebSocket,
    event: TwilioMediaEvent,
  ): Promise<void> {
    const { callSid, streamSid } = event.start!;

    this.logger.log(
      `Media stream started - CallSid: ${callSid}, StreamSid: ${streamSid}`,
    );

    // Store identifiers on client
    client.callSid = callSid;
    client.streamSid = streamSid;

    // Extract custom parameters from TwiML
    const customParams = event.start!.customParameters || {};
    const tenantId = customParams.tenantId || 'default';
    const phoneNumber = customParams.phoneNumber || 'unknown';

    // Create session in Redis
    await this.sessionService.createSession({
      callSid,
      streamSid,
      tenantId,
      phoneNumber,
    });

    // Initialize audio buffer
    this.audioBuffers.set(callSid, []);
    this.hasAudioSent.set(callSid, false);

    // Connect to OpenAI Realtime API
    await this.openAIService.connect(callSid, {
      onAudioDelta: (cSid, audioDelta) =>
        this.handleOpenAIAudioDelta(cSid, audioDelta),
      onTranscriptDelta: (cSid, delta) =>
        this.logger.debug(`Assistant speaking: ${delta}`),
      onResponseDone: (cSid) => this.logger.debug(`Response done for ${cSid}`),
      onUserTranscript: (cSid, transcript) =>
        this.logger.log(`User said: ${transcript}`),
      onError: (cSid, error) => this.logger.error(`OpenAI error: ${error}`),
      onDisconnect: (cSid) => this.cleanup(cSid),
    });

    this.logger.log(`Successfully initialized call ${callSid}`);
  }

  /**
   * Handles audio media events from Twilio
   */
  private async handleMedia(
    client: TwilioWebSocket,
    event: TwilioMediaEvent,
  ): Promise<void> {
    const callSid = client.callSid;
    if (!callSid) {
      return;
    }

    const { payload } = event.media!;

    try {
      // Decode mulaw audio from Twilio
      const mulawBuffer = Buffer.from(payload, 'base64');

      // Convert Twilio mulaw (8kHz) to OpenAI PCM16 (24kHz)
      const pcm24k = twilioToOpenAI(mulawBuffer);

      // Accumulate audio chunks
      const buffer = this.audioBuffers.get(callSid) || [];
      buffer.push(pcm24k);
      this.audioBuffers.set(callSid, buffer);

      // Send to OpenAI in batches (every ~100ms worth of audio)
      // At 24kHz, 16-bit PCM: 24000 samples/sec * 2 bytes = 48000 bytes/sec
      // 100ms = 4800 bytes
      const totalBytes = buffer.reduce((sum, b) => sum + b.length, 0);

      if (totalBytes >= 4800) {
        await this.flushAudioBuffer(callSid);
      }
    } catch (error) {
      this.logger.error(
        `Error processing media for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Flushes accumulated audio to OpenAI
   */
  private async flushAudioBuffer(callSid: string): Promise<void> {
    const buffer = this.audioBuffers.get(callSid);
    if (!buffer || buffer.length === 0) {
      return;
    }

    try {
      // Concatenate all buffers
      const concatenated = Buffer.concat(buffer);

      // Encode to base64 for OpenAI
      const audioBase64 = encodePcm16ToBase64(concatenated);

      // Send to OpenAI
      await this.openAIService.sendAudio(callSid, audioBase64);

      // Clear buffer
      this.audioBuffers.set(callSid, []);

      // Mark that we've sent audio
      if (!this.hasAudioSent.get(callSid)) {
        this.hasAudioSent.set(callSid, true);
      }
    } catch (error) {
      this.logger.error(
        `Error flushing audio buffer for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handles audio responses from OpenAI
   */
  private async handleOpenAIAudioDelta(
    callSid: string,
    audioDelta: string,
  ): Promise<void> {
    try {
      // Find the WebSocket client for this call
      const client = this.findClientByCallSid(callSid);
      if (!client || client.readyState !== WebSocket.OPEN) {
        this.logger.warn(`No active client for call ${callSid}`);
        return;
      }

      // Decode OpenAI audio (PCM16 24kHz)
      const pcm24k = decodeBase64ToPcm16(audioDelta);

      // Convert to Twilio format (mulaw 8kHz)
      const mulaw = openAIToTwilio(pcm24k);

      // Encode to base64 for Twilio
      const payload = mulaw.toString('base64');

      // Send to Twilio Media Stream
      const mediaMessage = {
        event: 'media',
        streamSid: client.streamSid,
        media: {
          payload,
        },
      };

      client.send(JSON.stringify(mediaMessage));
    } catch (error) {
      this.logger.error(
        `Error sending audio to Twilio for call ${callSid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handles the 'stop' event from Twilio
   */
  private async handleStop(
    client: TwilioWebSocket,
    event: TwilioMediaEvent,
  ): Promise<void> {
    const callSid = event.stop!.callSid;

    this.logger.log(`Media stream stopped for call ${callSid}`);

    await this.cleanup(callSid);
  }

  /**
   * Finds a WebSocket client by call SID
   */
  private findClientByCallSid(callSid: string): TwilioWebSocket | null {
    const clients = Array.from(this.server.clients) as TwilioWebSocket[];

    for (const client of clients) {
      if (client.callSid === callSid) {
        return client;
      }
    }

    return null;
  }

  /**
   * Cleans up resources for a call
   */
  private async cleanup(callSid: string): Promise<void> {
    this.logger.log(`Cleaning up resources for call ${callSid}`);

    // Flush any remaining audio
    await this.flushAudioBuffer(callSid);

    // Disconnect from OpenAI
    await this.openAIService.disconnect(callSid);

    // Get final session state
    const session = await this.sessionService.getSession(callSid);

    // Log final transcript
    if (session && session.transcript.length > 0) {
      this.logger.log(
        `Final transcript for call ${callSid}: ${session.transcript.length} messages`,
      );
    }

    // Update session status
    await this.sessionService.updateSession(callSid, {
      status: 'completed',
    });

    // Cleanup buffers
    this.audioBuffers.delete(callSid);
    this.hasAudioSent.delete(callSid);
  }

  /**
   * Heartbeat to keep connections alive
   */
  startHeartbeat(): void {
    setInterval(() => {
      const clients = Array.from(this.server.clients) as TwilioWebSocket[];

      for (const client of clients) {
        if (client.isAlive === false) {
          this.logger.warn(`Terminating inactive client: ${client.callSid}`);
          return client.terminate();
        }

        client.isAlive = false;
        client.ping();
      }
    }, 30000); // Every 30 seconds
  }
}
