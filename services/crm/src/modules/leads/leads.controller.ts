import { Controller, Post, Body, Headers, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiHeader, ApiBody, ApiResponse } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { UpsertLeadDto } from '../../dto';
import { ApiKeyGuard } from '../../guards/api-key.guard';

@Controller()
@UseGuards(ApiKeyGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('/internal/upsert_lead')
  @ApiOperation({ summary: 'Upsert Lead - Platform Compatible' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiBody({ type: UpsertLeadDto })
  @ApiResponse({
    status: 201,
    description: 'Lead upserted successfully',
    schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        created: { type: 'boolean' },
        lead_id: { type: 'string' },
      },
    },
  })
  async upsertLead(
    @Body() dto: UpsertLeadDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    const result = await this.leadsService.upsertLead(dto, idempotencyKey);
    return {
      leadId: result.id, // ✅ Platform expects this
      created: result.created, // ✅ Platform expects this
      lead_id: result.id, // ✅ Backward compatibility
    };
  }

  @Get('/health')
  @ApiOperation({ summary: 'Health check' })
  health() {
    return { status: 'ok', service: 'nestjs-crm' };
  }
}
