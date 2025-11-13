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
      this.logger.log(`Incoming call webhook for callId: ${callId}`);
      const twiml = await this.voiceCallsService.handleCallAnswered(callId);

      res.type('text/xml');
      res.status(HttpStatus.OK).send(twiml);
    } catch (error: any) {
      this.logger.error(`Error handling incoming call: ${error.message}`, error.stack);
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
    @Body() body: TwilioWebhookDto,
    @Res() res: Response,
  ) {
    try {
      const speechResult = body.SpeechResult || '';
      const turnNumber = parseInt(turn, 10) || 0;

      this.logger.log(`Response webhook for callId: ${callId}, turn: ${turnNumber}`);
      this.logger.debug(`Speech result: "${speechResult}"`);

      // If no speech detected, ask again
      if (!speechResult || speechResult.trim() === '') {
        this.logger.warn('No speech detected, prompting again');
        const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES">Lo siento, no te he escuchado. ¿Puedes repetir?</Say><Redirect method="POST">/voice-calls/webhook/response/' + callId + '?turn=' + turnNumber + '</Redirect></Response>';
        res.type('text/xml');
        res.status(HttpStatus.OK).send(twiml);
        return;
      }

      const twiml = await this.voiceCallsService.handleUserResponse(
        callId,
        speechResult,
        turnNumber,
      );

      res.type('text/xml');
      res.status(HttpStatus.OK).send(twiml);
    } catch (error: any) {
      this.logger.error(`Error handling response: ${error.message}`, error.stack);
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

      await this.voiceCallsService.updateCallStatus(
        callId,
        body.CallStatus || 'unknown',
      );

      res.status(HttpStatus.OK).send({ success: true });
    } catch (error: any) {
      this.logger.error(`Error handling status: ${error.message}`, error.stack);
      res.status(HttpStatus.OK).send({ success: false, error: error.message });
    }
  }

  /**
   * Webhook: Handle recording status
   */
  @Post('webhook/recording/:callId')
  @ApiOperation({ summary: 'Twilio webhook for recording (internal)' })
  async handleRecording(
    @Param('callId') callId: string,
    @Body() body: TwilioWebhookDto,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Recording webhook for callId: ${callId}`);

      if (body.RecordingUrl) {
        await this.voiceCallsService.updateCallStatus(
          callId,
          'completed',
          body.RecordingUrl,
        );
      }

      res.status(HttpStatus.OK).send({ success: true });
    } catch (error: any) {
      this.logger.error(`Error handling recording: ${error.message}`, error.stack);
      res.status(HttpStatus.OK).send({ success: false, error: error.message });
    }
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
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const filePath = path.join(os.tmpdir(), fileName);

      if (!fs.existsSync(filePath)) {
        this.logger.error(`Audio file not found: ${fileName}`);
        return res.status(HttpStatus.NOT_FOUND).send('Audio file not found');
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      this.logger.error(`Error serving audio: ${error.message}`, error.stack);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error serving audio');
    }
  }
}
