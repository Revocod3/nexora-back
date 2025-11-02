import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from '../../dto';
import { Tenant } from '../../entities';
import { ApiKeyGuard } from '../../guards/api-key.guard';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(ApiKeyGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully', type: Tenant })
  create(@Body() createTenantDto: CreateTenantDto): Promise<Tenant> {
    return this.tenantsService.create(createTenantDto);
  }

  @Post('bootstrap')
  @ApiOperation({ summary: 'Get or create default tenant for WhatsApp service' })
  @ApiResponse({ status: 200, description: 'Default tenant UUID', schema: { type: 'object', properties: { tenantId: { type: 'string' } } } })
  async bootstrap() {
    return this.tenantsService.getOrCreateDefault();
  }

  @Get()
  @ApiOperation({ summary: 'Get all tenants' })
  @ApiResponse({ status: 200, description: 'List of tenants', type: [Tenant] })
  findAll(): Promise<Tenant[]> {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by ID' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string): Promise<Tenant> {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.tenantsService.remove(id);
  }
}
