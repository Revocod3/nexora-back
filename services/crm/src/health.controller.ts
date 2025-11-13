import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('/health')
  health() {
    return {
      status: 'ok',
      service: 'nexora-crm',
      timestamp: new Date().toISOString()
    };
  }
}
