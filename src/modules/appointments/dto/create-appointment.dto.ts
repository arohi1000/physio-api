import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { AppointmentReasonForVisit, PaymentPreference } from '@prisma/client';
import { PatientDetailsDto } from './patient-details.dto';

export class CreateAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly serviceId: string;

  @ApiProperty({ example: '2026-03-05T04:30:00.000Z' })
  @IsISO8601()
  readonly startsAt: string;

  @ApiProperty({ type: PatientDetailsDto })
  @ValidateNested()
  @Type(() => PatientDetailsDto)
  readonly patient: PatientDetailsDto;

  @ApiProperty({ enum: AppointmentReasonForVisit })
  @IsEnum(AppointmentReasonForVisit)
  readonly reasonForVisit: AppointmentReasonForVisit;

  @ApiPropertyOptional({ example: 'WELCOME10', nullable: true })
  @IsOptional()
  @IsString()
  readonly couponCode?: string | null;

  @ApiProperty({ enum: PaymentPreference })
  @IsEnum(PaymentPreference)
  readonly paymentPreference: PaymentPreference;

  /**
   * Deliberately not `@IsBoolean()`-required: a missing or `false` value must
   * both surface as the specific `CONSENT_REQUIRED` (422) code, not
   * class-validator's generic 400. `AppointmentsService` enforces `=== true`.
   */
  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  readonly consentGiven?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  readonly captchaToken?: string | null;
}
