import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { ServicesService } from './services.service';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all services for a tenant' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID (uses default if not provided)' })
  @ApiResponse({ status: 200, description: 'Services list' })
  async getServices(@Query('tenantId') tenantId?: string) {
    // Use default tenant if not provided
    const tid = tenantId || process.env.SINGLE_TENANT_ID || '00000000-0000-0000-0000-000000000000';
    
    const services = await this.servicesService.findByClient(tid);
    
    // Map to frontend expected format
    return services.map(service => ({
      id: service.id,
      name: service.name,
      description: service.description || '',
      basePrice: Number(service.price),
      duration: service.duration_minutes,
      currency: service.currency,
      // Extract category and features from metadata if available
      category: service.metadata?.category || 'general',
      features: service.metadata?.features || [],
      status: service.status,
    }));
  }
}
