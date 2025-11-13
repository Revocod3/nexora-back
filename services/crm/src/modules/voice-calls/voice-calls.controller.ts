import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { VoiceCallsService } from './voice-calls.service';
import { CreateCallDto, TwilioWebhookDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { CallStatus } from '../../entities';

@ApiTags('Voice Calls')
@Controller('voice-calls')
export class VoiceCallsController {
  private readonly logger = new Logger(VoiceCallsController.name);

  constructor(private readonly voiceCallsService: VoiceCallsService) {}

  /**
   * Create an outbound call
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an outbound call to a lead' })
  @ApiResponse({ status: 201, description: 'Call created successfully' })
  async createCall(
    @CurrentTenant() tenantId: string,
    @Body() createCallDto: CreateCallDto,
  ) {
    this.logger.log(`Creating call for tenant ${tenantId} to ${createCallDto.toNumber}`);
    const call = await this.voiceCallsService.createOutboundCall(tenantId, createCallDto);
    return {
      success: true,
      data: call,
    };
  }

  /**
   * Get call by ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get call details by ID' })
  async getCall(@Param('id') id: string) {
    const call = await this.voiceCallsService.getCall(id);
    return {
      success: true,
      data: call,
    };
  }

  /**
   * Get all calls for tenant
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all calls for tenant' })
  async getCalls(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('status') status?: CallStatus,
  ) {
    const result = await this.voiceCallsService.getCallsForTenant(tenantId, {
      limit: limit ? parseInt(String(limit), 10) : undefined,
      offset: offset ? parseInt(String(offset), 10) : undefined,
      status,
    });

    return {
      success: true,
      data: result.calls,
      meta: {
        total: result.total,
        limit: limit || result.total,
        offset: offset || 0,
      },
    };
  }

  /**
   * Webhook: Handle incoming call (when call is answered)
   */
  @Post('webhook/incoming/:callId')
  @ApiOperation({ summary: 'Twilio webhook for incoming call (internal)' })
  async handleIncomingCall(
    @Param('callId') callId: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`[WEBHOOK-INCOMING] ========== CALL STARTED ========== callId: ${callId}`);
      const twiml = await this.voiceCallsService.handleCallAnswered(callId);

      this.logger.log(`[WEBHOOK-INCOMING] Sending TwiML response (${twiml.length} chars)`);
      res.type('text/xml');
      res.status(HttpStatus.OK).send(twiml);
      this.logger.log(`[WEBHOOK-INCOMING] Response sent successfully for callId: ${callId}`);
    } catch (error: any) {
      this.logger.error(`[WEBHOOK-INCOMING] CRITICAL ERROR for callId ${callId}: ${error.message}`, error.stack);
      res.type('text/xml');
      res.status(HttpStatus.OK).send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES">Lo siento, ha ocurrido un error.</Say><Hangup/></Response>'
      );
    }
  }

  /**
   * Webhook: Handle user speech response
   */
  @Post('webhook/response/:callId')
  @ApiOperation({ summary: 'Twilio webhook for user response (internal)' })
  async handleResponse(
    @Param('callId') callId: string,
    @Query('turn') turn: string,
    @Query('retry') retry: string,
    @Body() body: TwilioWebhookDto,
    @Res() res: Response,
  ) {
    try {
      const speechResult = body.SpeechResult || '';
      const turnNumber = parseInt(turn, 10) || 0;
      const retryCount = parseInt(retry, 10) || 0;

      this.logger.log(`[WEBHOOK-RESPONSE] callId: ${callId}, turn: ${turnNumber}, retry: ${retryCount}`);
      this.logger.debug(`[WEBHOOK-RESPONSE] Body keys: ${Object.keys(body).join(', ')}`);
      this.logger.debug(`[WEBHOOK-RESPONSE] Speech result: "${speechResult}"`);

      // If no speech detected, ask again (up to 3 retries per turn)
      if (!speechResult || speechResult.trim() === '') {
        this.logger.warn(`[WEBHOOK-RESPONSE] No speech detected for turn ${turnNumber}, retry ${retryCount}`);

        // After 3 retries, end the call
        if (retryCount >= 3) {
          this.logger.error(`[WEBHOOK-RESPONSE] Max retries reached for turn ${turnNumber}, ending call`);
          const endTwiml = await this.voiceCallsService.endCall(
            callId,
            'No he podido escucharte después de varios intentos. Por favor, llámanos de nuevo. Adiós.'
          );
          res.type('text/xml');
          res.status(HttpStatus.OK).send(endTwiml);
          return;
        }

        // Generate a new Gather to listen for user response again
        const retryActionUrl = `/api/voice-calls/webhook/response/${callId}?turn=${turnNumber}&retry=${retryCount + 1}`;
        const retryTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${retryActionUrl}" method="POST" timeout="5" speechTimeout="auto" language="es-ES" enhanced="true"><Say language="es-ES" voice="Polly.Lucia">Lo siento, no te he escuchado. ¿Puedes repetir?</Say></Gather><Redirect method="POST">${retryActionUrl}</Redirect></Response>`;

        this.logger.debug(`[WEBHOOK-RESPONSE] Sending retry TwiML with new Gather (attempt ${retryCount + 1})`);
        res.type('text/xml');
        res.status(HttpStatus.OK).send(retryTwiml);
        return;
      }

      this.logger.log(`[WEBHOOK-RESPONSE] Processing user input for turn ${turnNumber}...`);
      const twiml = await this.voiceCallsService.handleUserResponse(
        callId,
        speechResult,
        turnNumber,
      );

      this.logger.log(`[WEBHOOK-RESPONSE] TwiML generated for turn ${turnNumber}, length: ${twiml.length} chars`);
      res.type('text/xml');
      res.status(HttpStatus.OK).send(twiml);
    } catch (error: any) {
      this.logger.error(`[WEBHOOK-RESPONSE] ERROR for callId ${callId}, turn ${turn}: ${error.message}`, error.stack);
      const errorTwiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES">Lo siento, ha ocurrido un error. Adiós.</Say><Hangup/></Response>';
      res.type('text/xml');
      res.status(HttpStatus.OK).send(errorTwiml);
    }
  }

  /**
   * Webhook: Handle call status updates
   */
  @Post('webhook/status/:callId')
  @ApiOperation({ summary: 'Twilio webhook for call status updates (internal)' })
  async handleStatus(
    @Param('callId') callId: string,
    @Body() body: TwilioWebhookDto,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Status webhook for callId: ${callId}, status: ${body.CallStatus}`);

      await this.voiceCallsService.updateCallStatus(callId, body.CallStatus || 'unknown');

      res.status(HttpStatus.OK).send({ success: true });
    } catch (error: any) {
      this.logger.error(`Error handling status: ${error.message}`, error.stack);
      res.status(HttpStatus.OK).send({ success: false, error: error.message });
    }
  }

  /**
   * Webhook: Handle recording status (DISABLED - recordings not used to save costs)
   * Transcripts are saved in database instead from Speech-to-Text
   */
  @Post('webhook/recording/:callId')
  @ApiOperation({ summary: 'Twilio webhook for recording (disabled, not used)' })
  async handleRecording(
    @Param('callId') callId: string,
    @Body() body: TwilioWebhookDto,
    @Res() res: Response,
  ) {
    // Recording feature disabled to save ~$0.15-0.25 per call
    // Transcript is already saved in database from Speech-to-Text
    this.logger.debug(`Recording webhook received for callId: ${callId} (feature disabled)`);
    res.status(HttpStatus.OK).send({ success: true });
  }

  /**
   * Webhook: Handle answering machine detection
   */
  @Post('webhook/amd/:callId')
  @ApiOperation({ summary: 'Twilio webhook for answering machine detection (internal)' })
  async handleAMD(
    @Param('callId') callId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`AMD webhook for callId: ${callId}, result: ${body.AnsweredBy}`);

      // If answering machine detected, we might want to leave a voicemail or hang up
      if (body.AnsweredBy === 'machine_end_beep' || body.AnsweredBy === 'machine_end_silence') {
        this.logger.log('Answering machine detected, handling accordingly');
        // For now, we'll continue with the call
        // In production, you might want to leave a pre-recorded message
      }

      res.status(HttpStatus.OK).send({ success: true });
    } catch (error: any) {
      this.logger.error(`Error handling AMD: ${error.message}`, error.stack);
      res.status(HttpStatus.OK).send({ success: false, error: error.message });
    }
  }

  /**
   * Serve audio files (temporary endpoint for development)
   * In production, use S3 or CDN
   */
  @Get('audio/:fileName')
  @ApiOperation({ summary: 'Serve audio files (internal)' })
  async serveAudio(
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`[AUDIO-SERVE] Request for file: ${fileName}`);

      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const filePath = path.join(os.tmpdir(), fileName);
      this.logger.debug(`[AUDIO-SERVE] Full path: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        this.logger.error(`[AUDIO-SERVE] File NOT FOUND: ${fileName} at ${filePath}`);
        this.logger.error(`[AUDIO-SERVE] Temp dir contents: ${fs.readdirSync(os.tmpdir()).filter((f: string) => f.startsWith('call_')).join(', ')}`);
        return res.status(HttpStatus.NOT_FOUND).send('Audio file not found');
      }

      const fileSize = fs.statSync(filePath).size;
      this.logger.log(`[AUDIO-SERVE] Found file: ${fileName}, size: ${fileSize} bytes`);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fileSize.toString());

      const fileStream = fs.createReadStream(filePath);

      fileStream.on('end', () => {
        this.logger.log(`[AUDIO-SERVE] Successfully streamed: ${fileName}`);
      });

      fileStream.on('error', (error: any) => {
        this.logger.error(`[AUDIO-SERVE] Stream error for ${fileName}: ${error.message}`);
      });

      fileStream.pipe(res);
    } catch (error: any) {
      this.logger.error(`[AUDIO-SERVE] Error serving audio ${fileName}: ${error.message}`, error.stack);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error serving audio');
    }
  }
}
