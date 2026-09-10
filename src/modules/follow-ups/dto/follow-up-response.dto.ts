import { ApiProperty } from '@nestjs/swagger';
import { FollowUpStatus } from '@prisma/client';

/** `Follow-up` response shape — M3-CONTRACT.md §4. `reminderScheduledFor` is
 * computed and stored; nothing is enqueued (§7.4). */
export class FollowUpResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ format: 'uuid' })
  readonly patientId: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  readonly appointmentId: string | null;

  @ApiProperty()
  readonly purpose: string;

  @ApiProperty({ example: '2026-10-02' })
  readonly revisitTargetDate: string;

  @ApiProperty()
  readonly reminderScheduledFor: string;

  @ApiProperty({ enum: FollowUpStatus })
  readonly status: FollowUpStatus;

  @ApiProperty()
  readonly createdAt: string;
}

class PaginationMetaDto {
  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly limit: number;

  @ApiProperty()
  readonly total: number;

  @ApiProperty()
  readonly totalPages: number;
}

export class PaginatedFollowUpsDto {
  @ApiProperty({ type: [FollowUpResponseDto] })
  readonly data: FollowUpResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  readonly meta: PaginationMetaDto;
}
