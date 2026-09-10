import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const PATIENT_GENDERS = ['female', 'male', 'other'] as const;
export type PatientGender = (typeof PATIENT_GENDERS)[number];

/** Manual/walk-in add — `POST /admin/patients` (M3-CONTRACT.md §3). */
export class CreatePatientDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  readonly name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  readonly phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  readonly email?: string | null;

  @ApiPropertyOptional({ example: '1988-04-12', type: String, nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  readonly dob?: string | null;

  @ApiPropertyOptional({ enum: PATIENT_GENDERS, nullable: true })
  @IsOptional()
  @IsIn(PATIENT_GENDERS)
  readonly gender?: PatientGender | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  readonly notes?: string | null;

  /** Stamps `consentGivenAt` now when true. Omitted/false leaves it unset —
   * a walk-in add does not itself constitute consent to treatment. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly consentGiven?: boolean;
}
