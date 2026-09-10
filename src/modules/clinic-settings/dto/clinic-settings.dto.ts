import { ApiProperty } from '@nestjs/swagger';
import { WeeklyWorkingHoursDto } from './weekly-working-hours.dto';

export class ClinicSettingsDto {
  @ApiProperty({ example: 'Asia/Kolkata' })
  readonly timezone: string;

  @ApiProperty({ type: WeeklyWorkingHoursDto })
  readonly workingHours: WeeklyWorkingHoursDto;

  @ApiProperty({ example: 0 })
  readonly slotBufferMinutes: number;

  /**
   * Exposed so the CRM can show a doctor when a follow-up reminder will fire
   * *before* they commit it. Without it the reminder date is only knowable
   * after the record exists, which is the wrong order for a clinical decision.
   * The server remains authoritative; the client only previews.
   */
  @ApiProperty({ example: 2 })
  readonly followUpReminderLeadDays: number;
}
