import { ApiProperty } from '@nestjs/swagger';
import type { CouponValueType } from '@prisma/client';

export class CouponPreviewResponseDto {
  @ApiProperty({ example: 'WELCOME10' })
  readonly code: string;

  @ApiProperty({ enum: ['percent', 'fixed'] })
  readonly valueType: CouponValueType;

  @ApiProperty({ example: '10.00' })
  readonly value: string;

  @ApiProperty({ example: '1000.00' })
  readonly originalPrice: string;

  @ApiProperty({ example: '100.00' })
  readonly discountAmount: string;

  @ApiProperty({ example: '900.00' })
  readonly finalPrice: string;
}
