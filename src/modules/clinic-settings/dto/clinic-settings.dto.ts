import { ApiProperty } from '@nestjs/swagger';
import { WeeklyWorkingHoursDto } from './weekly-working-hours.dto';

export class ClinicSettingsDto {
  @ApiProperty({ example: 'Asia/Kolkata' })
  readonly timezone: string;

  @ApiProperty({ type: WeeklyWorkingHoursDto })
  readonly workingHours: WeeklyWorkingHoursDto;

  @ApiProperty({ example: 0 })
  readonly slotBufferMinutes: number;
}
