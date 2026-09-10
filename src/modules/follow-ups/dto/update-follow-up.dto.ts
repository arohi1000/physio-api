import { ApiPropertyOptional } from '@nestjs/swagger';
import { FollowUpStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** `PATCH /admin/follow-ups/:id` — status, target date, purpose
 * (M3-CONTRACT.md §3). */
export class UpdateFollowUpDto {
  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  readonly status?: FollowUpStatus;

  @ApiPropertyOptional({ example: '2026-10-16' })
  @IsOptional()
  @IsISO8601({ strict: true })
  readonly revisitTargetDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly purpose?: string;
}
