import { ApiProperty } from '@nestjs/swagger';
import type {
  AppointmentReasonForVisit,
  AppointmentStatus,
  BookingSource,
  PaymentPreference,
  PaymentStatus,
} from '@prisma/client';

class AdminAppointmentServiceDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly durationMinutes: number;
}

class AdminAppointmentPatientDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly phone: string;

  @ApiProperty({ nullable: true })
  readonly email: string | null;
}

class AdminAppointmentCancelledByDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;
}

export class AdminAppointmentListItemDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'PH-2026-0001' })
  readonly reference: string;

  @ApiProperty()
  readonly startsAt: string;

  @ApiProperty()
  readonly endsAt: string;

  @ApiProperty()
  readonly status: AppointmentStatus;

  @ApiProperty({ type: AdminAppointmentServiceDto })
  readonly service: AdminAppointmentServiceDto;

  @ApiProperty({ type: AdminAppointmentPatientDto })
  readonly patient: AdminAppointmentPatientDto;

  @ApiProperty({ example: '900.00' })
  readonly priceCharged: string;

  @ApiProperty()
  readonly paymentStatus: PaymentStatus;

  @ApiProperty()
  readonly bookingSource: BookingSource;
}

export class AdminAppointmentDetailDto extends AdminAppointmentListItemDto {
  @ApiProperty({ example: '1000.00' })
  readonly originalPrice: string;

  @ApiProperty({ example: '100.00' })
  readonly discountAmount: string;

  @ApiProperty({ nullable: true })
  readonly couponCode: string | null;

  @ApiProperty()
  readonly reasonForVisit: AppointmentReasonForVisit;

  @ApiProperty()
  readonly paymentPreference: PaymentPreference;

  @ApiProperty({ nullable: true })
  readonly cancellationReason: string | null;

  @ApiProperty({ type: AdminAppointmentCancelledByDto, nullable: true })
  readonly cancelledBy: AdminAppointmentCancelledByDto | null;

  @ApiProperty()
  readonly createdAt: string;

  @ApiProperty()
  readonly updatedAt: string;
}

class PaginationMetaDto {
  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly limit: number;

  @ApiProperty()
  readonly total: number;

  @ApiProperty()
  readonly totalPages: number;
}

export class PaginatedAdminAppointmentsDto {
  @ApiProperty({ type: [AdminAppointmentListItemDto] })
  readonly data: AdminAppointmentListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  readonly meta: PaginationMetaDto;
}
