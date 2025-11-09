import { Controller, Get, Post, Put, Delete, Body, Param, Patch } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.create(tenantId, dto);
  }

  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    return this.staffService.findAll(tenantId);
  }

  @Get('active')
  async findAllActive(@CurrentTenant() tenantId: string) {
    return this.staffService.findAllActive(tenantId);
  }

  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.staffService.findOne(tenantId, id);
  }

  @Put(':id')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(tenantId, id, dto);
  }

  @Patch(':id/deactivate')
  async deactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.staffService.deactivate(tenantId, id);
  }

  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.staffService.remove(tenantId, id);
  }
}
