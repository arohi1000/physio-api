import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentDto {
  @ApiProperty({ example: 'Doctor unwell, rescheduling on request' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  readonly reason: string;
}
