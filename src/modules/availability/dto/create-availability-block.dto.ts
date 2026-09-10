import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAvailabilityBlockDto {
  @ApiProperty({ example: '2026-03-05T04:30:00.000Z' })
  @IsISO8601()
  readonly startsAt: string;

  @ApiProperty({ example: '2026-03-05T09:30:00.000Z' })
  @IsISO8601()
  readonly endsAt: string;

  @ApiPropertyOptional({ example: 'Personal leave' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly reason?: string;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;COUNT=6',
    description: 'RRULE string, anchored to startsAt as DTSTART.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  readonly recurringRule?: string;
}
