import { CouponValueType, Prisma } from '@prisma/client';

export interface CouponPricing {
  readonly discountAmount: Prisma.Decimal;
  readonly finalPrice: Prisma.Decimal;
}

/**
 * Pure discount math, `Decimal`-based throughout (TRD/M2-CONTRACT.md §1:
 * money is never a float). A percent coupon never discounts below zero — the
 * discount is capped at `originalPrice` either way, so `finalPrice` is never
 * negative for either value type.
 */
export function computeCouponPricing(
  originalPrice: Prisma.Decimal,
  valueType: CouponValueType,
  value: Prisma.Decimal,
): CouponPricing {
  const rawDiscount =
    valueType === CouponValueType.percent
      ? originalPrice.mul(value).div(100)
      : value;

  const discountAmount = Prisma.Decimal.min(rawDiscount, originalPrice);
  const finalPrice = originalPrice.minus(discountAmount);

  return { discountAmount, finalPrice };
}
