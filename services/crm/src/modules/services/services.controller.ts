import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) { }

  @Get()
  @ApiOperation({ summary: 'Get all services for authenticated tenant' })
  @ApiResponse({ status: 200, description: 'Services list' })
  async getServices(@CurrentTenant() tenantId: string) {
    const services = await this.servicesService.findByClient(tenantId);

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
  @ApiOperation({ summary: 'Create a new service for authenticated tenant' })
  @ApiResponse({ status: 201, description: 'Service created successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async createService(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateServiceDto,
  ) {
    const created = await this.servicesService.create(tenantId, dto);

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
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const updated = await this.servicesService.update(id, tenantId, dto);

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
  async deactivateService(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ) {
    const deactivated = await this.servicesService.deactivate(id, tenantId);

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
