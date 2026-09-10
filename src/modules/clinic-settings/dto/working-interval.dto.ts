import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Local `HH:mm` wall-clock boundary, in the clinic's timezone. */
export class WorkingIntervalDto {
  @ApiProperty({ example: '09:00' })
  @Matches(HH_MM_PATTERN, { message: 'start must be a 24-hour HH:mm time' })
  readonly start: string;

  @ApiProperty({ example: '13:00' })
  @Matches(HH_MM_PATTERN, { message: 'end must be a 24-hour HH:mm time' })
  readonly end: string;
}
