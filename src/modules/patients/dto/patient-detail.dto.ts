import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type { PatientSource } from '@prisma/client';
import {
  TimelineAppointmentItemDto,
  TimelineFollowUpItemDto,
  TimelinePrescriptionItemDto,
  TimelineReceiptItemDto,
  type TimelineItemDto,
} from './timeline-item.dto';

/**
 * `Patient detail` — the aggregate the CRM timeline renders directly
 * (M3-CONTRACT.md §4). `notes` is the doctor's internal note field: it
 * belongs here and must never appear in any patient-facing (portal) response
 * — the field M6's portal read model has to exclude.
 */
@ApiExtraModels(
  TimelineAppointmentItemDto,
  TimelineFollowUpItemDto,
  TimelinePrescriptionItemDto,
  TimelineReceiptItemDto,
)
export class PatientDetailDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly phone: string;

  @ApiProperty({ type: String, nullable: true })
  readonly email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '1988-04-12' })
  readonly dob: string | null;

  @ApiProperty({ type: String, nullable: true })
  readonly gender: string | null;

  @ApiProperty()
  readonly source: PatientSource;

  @ApiProperty({ type: String, nullable: true })
  readonly notes: string | null;

  @ApiProperty({ type: String, nullable: true })
  readonly consentGivenAt: string | null;

  @ApiProperty()
  readonly createdAt: string;

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(TimelineAppointmentItemDto) },
        { $ref: getSchemaPath(TimelineFollowUpItemDto) },
        { $ref: getSchemaPath(TimelinePrescriptionItemDto) },
        { $ref: getSchemaPath(TimelineReceiptItemDto) },
      ],
    },
    description: 'Newest-first. Do not re-sort or re-merge on the client.',
  })
  readonly timeline: TimelineItemDto[];
}
