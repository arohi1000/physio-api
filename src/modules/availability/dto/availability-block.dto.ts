import { ApiProperty } from '@nestjs/swagger';

export class AvailabilityBlockDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: '2026-03-05T04:30:00.000Z' })
  readonly startsAt: string;

  @ApiProperty({ example: '2026-03-05T09:30:00.000Z' })
  readonly endsAt: string;

  @ApiProperty({ type: String, nullable: true, example: 'Personal leave' })
  readonly reason: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'FREQ=WEEKLY;COUNT=6' })
  readonly recurringRule: string | null;
}

export class AffectedAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: '2026-03-05T05:00:00.000Z' })
  readonly startsAt: string;

  @ApiProperty({ example: 'Asha Kumar' })
  readonly patientName: string;
}

/**
 * Creating (or editing) a block that overlaps existing bookings must succeed
 * and warn, never cancel anything (PRD §12, M2-CONTRACT.md §3).
 */
export class AvailabilityBlockWithWarningsDto extends AvailabilityBlockDto {
  @ApiProperty({ type: [AffectedAppointmentDto] })
  readonly affectedAppointments: AffectedAppointmentDto[];
}
