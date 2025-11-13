import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly whatsappServiceUrl: string;

  constructor(private readonly httpService: HttpService) {
    // WhatsApp service runs on port 3011 with /wa prefix
    this.whatsappServiceUrl =
      process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3011/wa';
  }

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status' })
  async getStatus() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.whatsappServiceUrl}/qr`, {
          headers: this.getInternalHeaders(),
        }),
      );

      // Check connection status from the WA service
      // Status values: 'open' (connected), 'connecting', 'close', 'forbidden'
      const status = response.data?.status || 'close';
      const connected = status === 'open';

      return {
        connected,
        number: response.data?.phoneNumber || null,
        status, // Include raw status for debugging
      };
    } catch (error: any) {
      console.error('WhatsApp status error:', error.message);
      // Service is down or unreachable
      throw new HttpException(
        {
          connected: false,
          number: null,
          error: 'WhatsApp service unavailable',
          details: error.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('qr')
  @ApiOperation({ summary: 'Get WhatsApp QR code' })
  @ApiResponse({ status: 200, description: 'QR code data' })
  async getQR() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.whatsappServiceUrl}/qr`, {
          headers: this.getInternalHeaders(),
        }),
      );

      // The WA service returns QR as base64 or data URL
      return {
        qr: response.data?.qr || response.data || '',
      };
    } catch (error: any) {
      console.error('WhatsApp QR error:', error.message);
      throw new HttpException(
        'Failed to get QR code. Make sure WhatsApp service is running.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('number')
  @ApiOperation({ summary: 'Pair WhatsApp with phone number' })
  @ApiResponse({ status: 200, description: 'Pairing initiated' })
  async pairWithNumber(@Body() body: { number: string }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.whatsappServiceUrl}/pair`,
          { phoneNumber: body.number },
          {
            headers: this.getInternalHeaders(),
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      console.error('WhatsApp pairing error:', error.message);
      throw new HttpException(
        'Failed to initiate pairing. Make sure the number is valid.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout from WhatsApp' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout() {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.whatsappServiceUrl}/reset`,
          {},
          {
            headers: this.getInternalHeaders(),
          },
        ),
      );

      return {
        success: true,
        message: 'WhatsApp session reset successfully',
      };
    } catch (error: any) {
      console.error('WhatsApp logout error:', error.message);
      throw new HttpException(
        'Failed to reset WhatsApp session.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getInternalHeaders() {
    const headers: Record<string, string> = {};

    // Add internal API key if configured
    const internalKey = process.env.CRM_INTERNAL_API_KEY;
    if (internalKey) {
      headers['x-internal-key'] = internalKey;
    }

    return headers;
  }
}
