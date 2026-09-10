import { ApiProperty } from '@nestjs/swagger';
import type { AppointmentStatus, PaymentStatus } from '@prisma/client';

class AppointmentServiceDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly durationMinutes: number;
}

class AppointmentPatientDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly phone: string;
}

class AppointmentPricingDto {
  @ApiProperty({ example: '1000.00' })
  readonly originalPrice: string;

  @ApiProperty({ example: '100.00' })
  readonly discountAmount: string;

  @ApiProperty({ example: '900.00' })
  readonly priceCharged: string;
}

export class AppointmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'PH-2026-0001' })
  readonly reference: string;

  @ApiProperty({ example: '2026-03-05T04:30:00.000Z' })
  readonly startsAt: string;

  @ApiProperty({ example: '2026-03-05T05:15:00.000Z' })
  readonly endsAt: string;

  @ApiProperty({ example: 'booked' })
  readonly status: AppointmentStatus;

  @ApiProperty({ type: AppointmentServiceDto })
  readonly service: AppointmentServiceDto;

  @ApiProperty({ type: AppointmentPatientDto })
  readonly patient: AppointmentPatientDto;

  @ApiProperty({ type: AppointmentPricingDto })
  readonly pricing: AppointmentPricingDto;

  @ApiProperty({ example: 'pending' })
  readonly paymentStatus: PaymentStatus;
}
