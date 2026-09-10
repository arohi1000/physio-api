import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class QueryAvailabilityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly serviceId: string;

  @ApiProperty({
    example: '2026-03-05',
    description: 'Local calendar date in the clinic timezone',
  })
  @IsDateString({ strict: true })
  readonly date: string;
}
