import { Controller, Post, Body, Headers, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiHeader, ApiBody, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpsertUserDto } from '../../dto';
import { ApiKeyGuard } from '../../guards/api-key.guard';

@Controller()
@UseGuards(ApiKeyGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('/internal/upsert_user')
  @ApiOperation({ summary: 'Upsert User - Platform Compatible' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiBody({ type: UpsertUserDto })
  @ApiResponse({
    status: 201,
    description: 'User upserted successfully',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        created: { type: 'boolean' },
        user_id: { type: 'string' },
      },
    },
  })
  async upsertUser(
    @Body() dto: UpsertUserDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    const result = await this.usersService.upsertUser(dto, idempotencyKey);
    return {
      userId: result.id,
      created: result.created,
      user_id: result.id, // Backward compatibility
    };
  }

  @Get('/health')
  @ApiOperation({ summary: 'Health check' })
  health() {
    return { status: 'ok', service: 'nestjs-crm' };
  }
}
