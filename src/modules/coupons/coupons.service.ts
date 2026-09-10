import { Injectable } from '@nestjs/common';
import type { Coupon, Prisma } from '@prisma/client';
import {
  CouponExpiredException,
  CouponInactiveException,
  CouponMaxUsesException,
  CouponNotFoundException,
} from '../../common/exceptions/app.exception';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '../prisma/prisma.service';
import { computeCouponPricing, type CouponPricing } from './coupon-pricing';
import type { CouponPreviewResponseDto } from './dto/coupon-preview-response.dto';

export interface AppliedCoupon extends CouponPricing {
  readonly couponId: string;
}

/**
 * Owns the `coupons` table. `previewValidate` is a read-only preview with no
 * side effects (M2-CONTRACT.md §2); `applyWithinTransaction` is the only path
 * that increments `used_count`, and must run inside the booking transaction
 * so a coupon that expires or exhausts between preview and confirm fails the
 * booking rather than being trusted from the earlier call.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async previewValidate(
    code: string,
    originalPrice: Prisma.Decimal,
  ): Promise<CouponPreviewResponseDto> {
    const coupon = await this.prisma.db.coupon.findUnique({ where: { code } });
    assertUsable(coupon);

    const pricing = computeCouponPricing(
      originalPrice,
      coupon.valueType,
      coupon.value,
    );

    return {
      code: coupon.code,
      valueType: coupon.valueType,
      value: coupon.value.toFixed(2),
      originalPrice: originalPrice.toFixed(2),
      discountAmount: pricing.discountAmount.toFixed(2),
      finalPrice: pricing.finalPrice.toFixed(2),
    };
  }

  /**
   * Locks the coupon row for the lifetime of the caller's transaction (via
   * `SELECT ... FOR UPDATE`) before validating it, so two concurrent bookings
   * using the same code cannot both read `used_count < max_uses` as true and
   * both commit — the second waits for the first's transaction to finish,
   * then re-reads the now-incremented count.
   */
  async applyWithinTransaction(
    tx: PrismaTransactionClient,
    code: string,
    originalPrice: Prisma.Decimal,
  ): Promise<AppliedCoupon> {
    await tx.$executeRaw`SELECT id FROM coupons WHERE code = ${code} FOR UPDATE`;
    const coupon = await tx.coupon.findUnique({ where: { code } });
    assertUsable(coupon);

    const pricing = computeCouponPricing(
      originalPrice,
      coupon.valueType,
      coupon.value,
    );

    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    return { couponId: coupon.id, ...pricing };
  }
}

function assertUsable(coupon: Coupon | null): asserts coupon is Coupon {
  if (!coupon) {
    throw new CouponNotFoundException();
  }
  if (!coupon.active) {
    throw new CouponInactiveException();
  }
  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validUntil) {
    throw new CouponExpiredException();
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new CouponMaxUsesException();
  }
}
