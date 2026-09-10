import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const DECIMAL_STRING_PATTERN = /^\d+(\.\d{1,2})?$/;

/** `POST /admin/patients/:id/receipts` (M3-CONTRACT.md §4). `amount` is
 * optional in the request: omitted, it prefills from the linked
 * appointment's `priceCharged`. */
export class CreateReceiptDto {
  @ApiPropertyOptional({ example: '1000.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'amount must be a decimal string, e.g. "1000.00"',
  })
  readonly amount?: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  readonly paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly appointmentId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  readonly notes?: string | null;
}
