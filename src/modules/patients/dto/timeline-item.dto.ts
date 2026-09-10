import { ApiProperty } from '@nestjs/swagger';
import type {
  AppointmentStatus,
  FollowUpStatus,
  PaymentMethod,
} from '@prisma/client';

/**
 * The four record kinds `PatientDetailDto.timeline` merges, newest-first
 * (M3-CONTRACT.md §4). Modelled as a discriminated union on `kind` so the CRM
 * can switch on it directly; each branch gets its own Swagger schema via
 * `@ApiExtraModels` + `oneOf` on the field that uses this type.
 */
export class TimelineAppointmentItemDto {
  @ApiProperty({ enum: ['appointment'] })
  readonly kind = 'appointment' as const;

  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly at: string;

  @ApiProperty()
  readonly status: AppointmentStatus;

  @ApiProperty()
  readonly serviceName: string;

  @ApiProperty()
  readonly reference: string;
}

export class TimelineFollowUpItemDto {
  @ApiProperty({ enum: ['follow_up'] })
  readonly kind = 'follow_up' as const;

  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly at: string;

  @ApiProperty()
  readonly status: FollowUpStatus;

  @ApiProperty()
  readonly purpose: string;

  @ApiProperty()
  readonly revisitTargetDate: string;
}

export class TimelinePrescriptionItemDto {
  @ApiProperty({ enum: ['prescription'] })
  readonly kind = 'prescription' as const;

  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly at: string;

  @ApiProperty({ example: '3 medicines, 2 exercises' })
  readonly summary: string;
}

export class TimelineReceiptItemDto {
  @ApiProperty({ enum: ['receipt'] })
  readonly kind = 'receipt' as const;

  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'RCP-2026-0001' })
  readonly number: string;

  @ApiProperty()
  readonly at: string;

  @ApiProperty({ example: '1000.00' })
  readonly amount: string;

  @ApiProperty()
  readonly paymentMethod: PaymentMethod;
}

export type TimelineItemDto =
  | TimelineAppointmentItemDto
  | TimelineFollowUpItemDto
  | TimelinePrescriptionItemDto
  | TimelineReceiptItemDto;
