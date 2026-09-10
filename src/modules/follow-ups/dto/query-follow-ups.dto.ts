import { ApiPropertyOptional } from '@nestjs/swagger';
import { FollowUpStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/** `GET /admin/follow-ups?status=&dueBefore=` — the follow-up queue
 * (M3-CONTRACT.md §3). `dueBefore` filters on `revisitTargetDate`. */
export class QueryFollowUpsDto {
  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  readonly status?: FollowUpStatus;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  readonly dueBefore?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit: number = 20;
}
