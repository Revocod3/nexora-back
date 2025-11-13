import { Controller, Get, Post, Put, Delete, Body, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({ summary: 'Create new staff member' })
  @ApiResponse({ status: 201, description: 'Staff member created' })
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all staff members' })
  @ApiResponse({ status: 200, description: 'Staff members list' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.staffService.findAll(tenantId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active staff members only' })
  @ApiResponse({ status: 200, description: 'Active staff members list' })
  async findAllActive(@CurrentTenant() tenantId: string) {
    return this.staffService.findAllActive(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiResponse({ status: 200, description: 'Staff member details' })
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.staffService.findOne(tenantId, id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Get staff member availability for a specific date' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format', example: '2025-11-10' })
  @ApiResponse({ status: 200, description: 'Available time slots' })
  async getAvailability(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    return this.staffService.getAvailability(tenantId, id, date);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update staff member' })
  @ApiResponse({ status: 200, description: 'Staff member updated' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(tenantId, id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate staff member' })
  @ApiResponse({ status: 200, description: 'Staff member deactivated' })
  async deactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.staffService.deactivate(tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete staff member' })
  @ApiResponse({ status: 200, description: 'Staff member deleted' })
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.staffService.remove(tenantId, id);
  }
}
