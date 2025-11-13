import { Controller, Get, Post, Query, Param, Headers, Req, Res, UseGuards, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleCalendarService } from './google-calendar.service';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';

@Controller('google-calendar')
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);

  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Initiate OAuth2 flow for a staff member
   * GET /api/google-calendar/connect/:staffId
   */
  @Get('connect/:staffId')
  @UseGuards(JwtAuthGuard)
  async connect(
    @Param('staffId') staffId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const tenantId = req.user.tenantId;
    const authUrl = this.googleCalendarService.generateAuthUrl(staffId, tenantId);

    // Redirect user to Google OAuth consent screen
    return res.redirect(authUrl);
  }

  /**
   * OAuth2 callback endpoint
   * GET /api/google-calendar/oauth/callback?code=...&state=...
   */
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      await this.googleCalendarService.handleOAuthCallback(code, state);

      // Redirect to success page (you can customize this URL)
      return res.send(`
        <html>
          <head>
            <title>Google Calendar Connected</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .success {
                color: #4CAF50;
                font-size: 48px;
                margin-bottom: 20px;
              }
              h1 {
                color: #333;
                margin-bottom: 10px;
              }
              p {
                color: #666;
                margin-bottom: 20px;
              }
              button {
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
              }
              button:hover {
                background-color: #45a049;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✓</div>
              <h1>¡Calendario Conectado!</h1>
              <p>Tu Google Calendar se ha conectado correctamente.</p>
              <p>Las citas se sincronizarán automáticamente.</p>
              <button onclick="window.close()">Cerrar</button>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      this.logger.error(`OAuth callback error: ${error.message}`);
      return res.status(500).send(`
        <html>
          <head>
            <title>Error</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .error {
                color: #f44336;
                font-size: 48px;
                margin-bottom: 20px;
              }
              h1 {
                color: #333;
                margin-bottom: 10px;
              }
              p {
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error">✗</div>
              <h1>Error al Conectar</h1>
              <p>No se pudo conectar tu Google Calendar.</p>
              <p>Por favor, intenta de nuevo.</p>
            </div>
          </body>
        </html>
      `);
    }
  }

  /**
   * Google Calendar webhook endpoint
   * POST /api/google-calendar/webhook
   */
  @Post('webhook')
  async webhook(
    @Headers('x-goog-channel-id') channelId: string,
    @Headers('x-goog-resource-id') resourceId: string,
    @Headers('x-goog-resource-state') resourceState: string,
  ) {
    this.logger.log(`Webhook received: channel=${channelId}, resource=${resourceId}, state=${resourceState}`);

    // Ignore sync messages
    if (resourceState === 'sync') {
      return { status: 'ok' };
    }

    // Handle exists/update notifications
    if (resourceState === 'exists' || resourceState === 'update') {
      await this.googleCalendarService.handleWebhookNotification(channelId, resourceId);
    }

    return { status: 'ok' };
  }

  /**
   * Disconnect Google Calendar for a staff member
   * DELETE /api/google-calendar/disconnect/:staffId
   */
  @Post('disconnect/:staffId')
  @UseGuards(JwtAuthGuard)
  async disconnect(@Param('staffId') staffId: string) {
    await this.googleCalendarService.disconnectCalendar(staffId);
    return { message: 'Google Calendar disconnected successfully' };
  }

  /**
   * Get connection status for a staff member
   * GET /api/google-calendar/status/:staffId
   */
  @Get('status/:staffId')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Param('staffId') staffId: string) {
    const credentials = await this.googleCalendarService.getConnectionStatus(staffId);

    return {
      connected: !!credentials,
      syncEnabled: credentials?.sync_enabled || false,
      calendarId: credentials?.calendar_id,
      lastSynced: credentials?.updated_at,
    };
  }
}
