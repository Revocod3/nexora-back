import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GoogleCalendarCredentials } from '../../entities/google-calendar-credentials.entity';
import { Appointment } from '../../entities/appointment.entity';
import { Staff } from '../../entities/staff.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauth2Client: OAuth2Client;

  constructor(
    @InjectRepository(GoogleCalendarCredentials)
    private credentialsRepository: Repository<GoogleCalendarCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    private configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  /**
   * Generate OAuth2 URL for staff member to connect their Google Calendar
   */
  generateAuthUrl(staffId: string, tenantId: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    const state = JSON.stringify({ staffId, tenantId });

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent', // Force consent screen to get refresh token
    });
  }

  /**
   * Handle OAuth2 callback and store credentials
   */
  async handleOAuthCallback(code: string, state: string): Promise<GoogleCalendarCredentials> {
    const { staffId, tenantId } = JSON.parse(state);

    // Exchange code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);

    const staff = await this.staffRepository.findOne({
      where: { id: staffId, tenant_id: tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    // Check if credentials already exist
    let credentials = await this.credentialsRepository.findOne({
      where: { staff_id: staffId },
    });

    if (credentials) {
      // Update existing credentials
      credentials.access_token = tokens.access_token!;
      credentials.refresh_token = tokens.refresh_token || credentials.refresh_token;
      credentials.token_expiry_date = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      credentials.sync_enabled = true;
    } else {
      // Create new credentials
      credentials = this.credentialsRepository.create({
        tenant_id: tenantId,
        staff_id: staffId,
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token,
        token_expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendar_id: 'primary',
        sync_enabled: true,
      });
    }

    await this.credentialsRepository.save(credentials);

    // Set up watch channel for push notifications
    await this.setupWatchChannel(credentials);

    this.logger.log(`Google Calendar connected for staff ${staffId}`);

    return credentials;
  }

  /**
   * Set up Google Calendar push notification channel
   */
  private async setupWatchChannel(credentials: GoogleCalendarCredentials): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(credentials);
      const webhookUrl = this.configService.get<string>('GOOGLE_CALENDAR_WEBHOOK_URL');

      if (!webhookUrl) {
        this.logger.warn('GOOGLE_CALENDAR_WEBHOOK_URL not configured, skipping watch setup');
        return;
      }

      const channelId = uuidv4();
      const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

      const response = await calendar.events.watch({
        calendarId: credentials.calendar_id,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          expiration: expiration.toString(),
        },
      });

      credentials.watch_channel_id = channelId;
      credentials.watch_resource_id = response.data.resourceId;
      credentials.watch_expiration = new Date(expiration);

      await this.credentialsRepository.save(credentials);

      this.logger.log(`Watch channel set up for staff ${credentials.staff_id}`);
    } catch (error) {
      this.logger.error(`Failed to set up watch channel: ${error.message}`);
    }
  }

  /**
   * Get authenticated Google Calendar client for a staff member
   */
  private async getCalendarClient(credentials: GoogleCalendarCredentials): Promise<calendar_v3.Calendar> {
    this.oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
      expiry_date: credentials.token_expiry_date?.getTime(),
    });

    // Check if token needs refresh
    const tokenInfo = await this.oauth2Client.getTokenInfo(credentials.access_token);
    if (tokenInfo.expiry_date && tokenInfo.expiry_date < Date.now()) {
      const { credentials: newTokens } = await this.oauth2Client.refreshAccessToken();

      credentials.access_token = newTokens.access_token!;
      if (newTokens.refresh_token) {
        credentials.refresh_token = newTokens.refresh_token;
      }
      credentials.token_expiry_date = newTokens.expiry_date ? new Date(newTokens.expiry_date) : null;

      await this.credentialsRepository.save(credentials);
    }

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create Google Calendar event from appointment
   */
  async createCalendarEvent(appointment: Appointment): Promise<void> {
    if (!appointment.staff_id) {
      this.logger.debug('Appointment has no staff assigned, skipping Google Calendar sync');
      return;
    }

    const credentials = await this.credentialsRepository.findOne({
      where: { staff_id: appointment.staff_id, sync_enabled: true },
      relations: ['staff'],
    });

    if (!credentials) {
      this.logger.debug(`No Google Calendar connected for staff ${appointment.staff_id}`);
      return;
    }

    try {
      const calendar = await this.getCalendarClient(credentials);

      // Calculate end time based on service duration
      const startTime = new Date(appointment.scheduled_at);
      const endTime = new Date(startTime);
      endTime.setMinutes(startTime.getMinutes() + (appointment.service?.duration_minutes || 60));

      const event: calendar_v3.Schema$Event = {
        summary: `${appointment.customer_name || 'Cliente'} - ${appointment.service?.name || 'Servicio'}`,
        description: appointment.notes || '',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Europe/Madrid',
        },
        attendees: appointment.customer_phone ? [
          { email: `${appointment.customer_phone}@phone.invalid`, displayName: appointment.customer_name }
        ] : undefined,
        extendedProperties: {
          private: {
            appointmentId: appointment.id,
            tenantId: appointment.tenant.id,
          },
        },
      };

      const response = await calendar.events.insert({
        calendarId: credentials.calendar_id,
        requestBody: event,
      });

      // Store Google event ID in appointment
      appointment.google_event_id = response.data.id!;
      appointment.google_synced_at = new Date();
      await this.appointmentRepository.save(appointment);

      this.logger.log(`Created Google Calendar event ${response.data.id} for appointment ${appointment.id}`);
    } catch (error) {
      this.logger.error(`Failed to create Google Calendar event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update Google Calendar event from appointment
   */
  async updateCalendarEvent(appointment: Appointment): Promise<void> {
    if (!appointment.google_event_id || !appointment.staff_id) {
      this.logger.debug('Appointment not synced with Google Calendar or no staff assigned');
      return;
    }

    const credentials = await this.credentialsRepository.findOne({
      where: { staff_id: appointment.staff_id, sync_enabled: true },
    });

    if (!credentials) {
      this.logger.debug(`No Google Calendar connected for staff ${appointment.staff_id}`);
      return;
    }

    try {
      const calendar = await this.getCalendarClient(credentials);

      const startTime = new Date(appointment.scheduled_at);
      const endTime = new Date(startTime);
      endTime.setMinutes(startTime.getMinutes() + (appointment.service?.duration_minutes || 60));

      const event: calendar_v3.Schema$Event = {
        summary: `${appointment.customer_name || 'Cliente'} - ${appointment.service?.name || 'Servicio'}`,
        description: appointment.notes || '',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Europe/Madrid',
        },
      };

      await calendar.events.update({
        calendarId: credentials.calendar_id,
        eventId: appointment.google_event_id,
        requestBody: event,
      });

      appointment.google_synced_at = new Date();
      await this.appointmentRepository.save(appointment);

      this.logger.log(`Updated Google Calendar event ${appointment.google_event_id} for appointment ${appointment.id}`);
    } catch (error) {
      this.logger.error(`Failed to update Google Calendar event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete Google Calendar event
   */
  async deleteCalendarEvent(appointment: Appointment): Promise<void> {
    if (!appointment.google_event_id || !appointment.staff_id) {
      this.logger.debug('Appointment not synced with Google Calendar or no staff assigned');
      return;
    }

    const credentials = await this.credentialsRepository.findOne({
      where: { staff_id: appointment.staff_id, sync_enabled: true },
    });

    if (!credentials) {
      this.logger.debug(`No Google Calendar connected for staff ${appointment.staff_id}`);
      return;
    }

    try {
      const calendar = await this.getCalendarClient(credentials);

      await calendar.events.delete({
        calendarId: credentials.calendar_id,
        eventId: appointment.google_event_id,
      });

      this.logger.log(`Deleted Google Calendar event ${appointment.google_event_id} for appointment ${appointment.id}`);
    } catch (error) {
      this.logger.error(`Failed to delete Google Calendar event: ${error.message}`);
      // Don't throw - appointment might already be deleted from calendar
    }
  }

  /**
   * Check staff availability by querying Google Calendar
   */
  async checkStaffAvailability(
    staffId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const credentials = await this.credentialsRepository.findOne({
      where: { staff_id: staffId, sync_enabled: true },
    });

    if (!credentials) {
      // If no Google Calendar connected, assume available
      return true;
    }

    try {
      const calendar = await this.getCalendarClient(credentials);

      const response = await calendar.events.list({
        calendarId: credentials.calendar_id,
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true,
      });

      const events = response.data.items || [];

      // Check if there are any events in this time slot
      return events.length === 0;
    } catch (error) {
      this.logger.error(`Failed to check Google Calendar availability: ${error.message}`);
      // On error, assume available to not block bookings
      return true;
    }
  }

  /**
   * Handle Google Calendar webhook notification
   */
  async handleWebhookNotification(channelId: string, resourceId: string): Promise<void> {
    const credentials = await this.credentialsRepository.findOne({
      where: { watch_channel_id: channelId, watch_resource_id: resourceId },
    });

    if (!credentials) {
      this.logger.warn(`Received webhook for unknown channel ${channelId}`);
      return;
    }

    this.logger.log(`Received Google Calendar webhook for staff ${credentials.staff_id}`);

    // Sync recent changes from Google Calendar
    await this.syncFromGoogleCalendar(credentials);
  }

  /**
   * Sync events from Google Calendar to our system
   */
  private async syncFromGoogleCalendar(credentials: GoogleCalendarCredentials): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(credentials);

      // Get events from last 24 hours
      const timeMin = new Date();
      timeMin.setHours(timeMin.getHours() - 24);

      const response = await calendar.events.list({
        calendarId: credentials.calendar_id,
        timeMin: timeMin.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      for (const event of events) {
        // Only process events with our appointment ID
        const appointmentId = event.extendedProperties?.private?.appointmentId;
        if (!appointmentId) continue;

        const appointment = await this.appointmentRepository.findOne({
          where: { id: appointmentId },
          relations: ['service'],
        });

        if (!appointment) continue;

        // Check if event was deleted
        if (event.status === 'cancelled') {
          appointment.status = 'cancelled';
          appointment.cancellation_reason = 'Cancelled in Google Calendar';
          await this.appointmentRepository.save(appointment);
          this.logger.log(`Synced cancellation from Google Calendar for appointment ${appointmentId}`);
          continue;
        }

        // Check if event was rescheduled
        if (event.start?.dateTime) {
          const newStartTime = new Date(event.start.dateTime);
          if (newStartTime.getTime() !== appointment.scheduled_at.getTime()) {
            appointment.scheduled_at = newStartTime;
            appointment.google_synced_at = new Date();
            await this.appointmentRepository.save(appointment);
            this.logger.log(`Synced rescheduling from Google Calendar for appointment ${appointmentId}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to sync from Google Calendar: ${error.message}`);
    }
  }

  /**
   * Disconnect Google Calendar for a staff member
   */
  async disconnectCalendar(staffId: string): Promise<void> {
    const credentials = await this.credentialsRepository.findOne({
      where: { staff_id: staffId },
    });

    if (!credentials) {
      throw new NotFoundException('No Google Calendar connection found');
    }

    // Stop watching calendar
    if (credentials.watch_channel_id && credentials.watch_resource_id) {
      try {
        const calendar = await this.getCalendarClient(credentials);
        await calendar.channels.stop({
          requestBody: {
            id: credentials.watch_channel_id,
            resourceId: credentials.watch_resource_id,
          },
        });
      } catch (error) {
        this.logger.error(`Failed to stop watch channel: ${error.message}`);
      }
    }

    await this.credentialsRepository.remove(credentials);
    this.logger.log(`Disconnected Google Calendar for staff ${staffId}`);
  }

  /**
   * Get calendar connection status for staff
   */
  async getConnectionStatus(staffId: string): Promise<GoogleCalendarCredentials | null> {
    return this.credentialsRepository.findOne({
      where: { staff_id: staffId },
    });
  }
}
