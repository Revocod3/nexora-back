import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsObject } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte de Cabello', description: 'Service name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Corte tradicional con lavado incluido', description: 'Service description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 30, description: 'Duration in minutes' })
  @IsNumber()
  @Min(1)
  duration_minutes!: number;

  @ApiProperty({ example: 25.00, description: 'Service price' })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 'EUR', description: 'Currency code', default: 'EUR' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    example: { category: 'haircut', features: ['wash', 'styling'] },
    description: 'Additional metadata (category, features, etc.)'
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
