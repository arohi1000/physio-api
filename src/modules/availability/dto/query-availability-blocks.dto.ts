import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class QueryAvailabilityBlocksDto {
  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  @IsISO8601()
  readonly from: string;

  @ApiProperty({ example: '2026-04-01T00:00:00.000Z' })
  @IsISO8601()
  readonly to: string;
}
