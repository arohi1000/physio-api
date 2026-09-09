import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryAuditLogsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter by acting user.',
  })
  @IsOptional()
  @IsUUID()
  readonly userId?: string;

  @ApiPropertyOptional({ example: 'patient.delete' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  readonly action?: string;

  @ApiPropertyOptional({ example: 'appointment' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly entityType?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  readonly pageSize: number = 50;
}
