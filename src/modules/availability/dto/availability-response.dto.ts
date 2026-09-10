import { ApiProperty } from '@nestjs/swagger';

export class SlotDto {
  @ApiProperty({ example: '2026-03-05T04:30:00.000Z' })
  readonly startsAt: string;

  @ApiProperty({ example: '2026-03-05T05:15:00.000Z' })
  readonly endsAt: string;
}

export class AvailabilityResponseDto {
  @ApiProperty({ example: '2026-03-05' })
  readonly date: string;

  @ApiProperty({ example: 'Asia/Kolkata' })
  readonly timezone: string;

  @ApiProperty({ format: 'uuid' })
  readonly serviceId: string;

  @ApiProperty({ example: 45 })
  readonly durationMinutes: number;

  @ApiProperty({
    type: [SlotDto],
    description:
      'Bookable slots. An empty array is a valid, non-error response.',
  })
  readonly slots: SlotDto[];
}
