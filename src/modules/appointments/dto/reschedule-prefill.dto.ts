import { ApiProperty } from '@nestjs/swagger';

class ReschedulePatientDto {
  @ApiProperty({ example: 'Asha Kumar' })
  readonly name: string;

  @ApiProperty({ example: '+919876543210' })
  readonly phone: string;
}

/** Never the full patient record — name and phone only (M2-CONTRACT.md §2). */
export class ReschedulePrefillDto {
  @ApiProperty({ type: ReschedulePatientDto })
  readonly patient: ReschedulePatientDto;

  @ApiProperty({ format: 'uuid' })
  readonly suggestedServiceId: string;

  @ApiProperty({ format: 'uuid' })
  readonly previousAppointmentId: string;
}
