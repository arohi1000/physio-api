import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrescriptionMedicineDto {
  @ApiProperty({ example: 'Ibuprofen' })
  @IsString()
  readonly name: string;

  @ApiProperty({ example: '400mg' })
  @IsString()
  readonly dose: string;

  @ApiProperty({ example: 'twice daily' })
  @IsString()
  readonly frequency: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  readonly durationDays: number;
}

export class PrescriptionExerciseDto {
  @ApiProperty({ example: 'Scapular retraction' })
  @IsString()
  readonly name: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  readonly sets: number;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  readonly reps: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  readonly notes?: string | null;
}

/** `POST /admin/patients/:id/prescriptions` — structured content, not a text
 * blob (M3-CONTRACT.md §4). */
export class CreatePrescriptionDto {
  @ApiProperty({ type: [PrescriptionMedicineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionMedicineDto)
  readonly medicines: PrescriptionMedicineDto[];

  @ApiProperty({ type: [PrescriptionExerciseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionExerciseDto)
  readonly exercises: PrescriptionExerciseDto[];

  @ApiProperty({ example: 'Ice for 10 minutes after each session.' })
  @IsString()
  readonly instructions: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly appointmentId?: string | null;
}
