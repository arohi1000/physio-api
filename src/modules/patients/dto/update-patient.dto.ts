import { PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create-patient.dto';

/** `PATCH /admin/patients/:id`. Every field optional; phone re-checks
 * uniqueness only when it actually changes. */
export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
