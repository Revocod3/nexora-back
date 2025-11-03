import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) { }

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

  @Post()
  @ApiOperation({ summary: 'Create a new service for a tenant' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID (uses default if not provided)' })
  @ApiResponse({ status: 201, description: 'Service created successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async createService(
    @Body() dto: CreateServiceDto,
    @Query('tenantId') tenantId?: string,
  ) {
    const tid = tenantId || process.env.SINGLE_TENANT_ID || '00000000-0000-0000-0000-000000000000';

    const created = await this.servicesService.create(tid, dto);

    // Map to frontend expected format
    return {
      id: created.id,
      name: created.name,
      description: created.description || '',
      basePrice: Number(created.price),
      duration: created.duration_minutes,
      currency: created.currency,
      category: created.metadata?.category || 'general',
      features: created.metadata?.features || [],
      status: created.status,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing service' })
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiResponse({ status: 200, description: 'Service updated successfully' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async updateService(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const updated = await this.servicesService.update(id, dto);

    // Map to frontend expected format
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description || '',
      basePrice: Number(updated.price),
      duration: updated.duration_minutes,
      currency: updated.currency,
      category: updated.metadata?.category || 'general',
      features: updated.metadata?.features || [],
      status: updated.status,
    };
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a service (soft delete)' })
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiResponse({ status: 200, description: 'Service deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async deactivateService(@Param('id') id: string) {
    const deactivated = await this.servicesService.deactivate(id);

    // Map to frontend expected format
    return {
      id: deactivated.id,
      name: deactivated.name,
      description: deactivated.description || '',
      basePrice: Number(deactivated.price),
      duration: deactivated.duration_minutes,
      currency: deactivated.currency,
      category: deactivated.metadata?.category || 'general',
      features: deactivated.metadata?.features || [],
      status: deactivated.status,
    };
  }
}
