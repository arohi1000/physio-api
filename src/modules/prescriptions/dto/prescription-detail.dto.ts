import { ApiProperty } from '@nestjs/swagger';
import {
  PrescriptionExerciseDto,
  PrescriptionMedicineDto,
} from './create-prescription.dto';

export class PrescriptionDetailDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ format: 'uuid' })
  readonly patientId: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  readonly appointmentId: string | null;

  @ApiProperty({ type: [PrescriptionMedicineDto] })
  readonly medicines: PrescriptionMedicineDto[];

  @ApiProperty({ type: [PrescriptionExerciseDto] })
  readonly exercises: PrescriptionExerciseDto[];

  @ApiProperty()
  readonly instructions: string;

  @ApiProperty()
  readonly issuedAt: string;
}
