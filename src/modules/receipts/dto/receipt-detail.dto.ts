import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class ReceiptDetailDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({
    example: 'RCP-2026-0001',
    description: 'Quotable receipt number.',
  })
  readonly number: string;

  @ApiProperty({ format: 'uuid' })
  readonly patientId: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  readonly appointmentId: string | null;

  @ApiProperty({ example: '1000.00' })
  readonly amount: string;

  @ApiProperty({ enum: PaymentMethod })
  readonly paymentMethod: PaymentMethod;

  @ApiProperty({ type: String, nullable: true })
  readonly notes: string | null;

  @ApiProperty()
  readonly issuedAt: string;
}
