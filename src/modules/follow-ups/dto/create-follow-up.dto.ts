import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** `POST /admin/patients/:id/follow-ups` (M3-CONTRACT.md §4). */
export class CreateFollowUpDto {
  @ApiProperty({ example: 'Review shoulder mobility' })
  @IsString()
  @MaxLength(500)
  readonly purpose: string;

  @ApiProperty({ example: '2026-10-02' })
  @IsISO8601({ strict: true })
  readonly revisitTargetDate: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly appointmentId?: string | null;
}
