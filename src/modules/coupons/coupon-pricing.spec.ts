import { CouponValueType, Prisma } from '@prisma/client';
import { computeCouponPricing } from './coupon-pricing';

describe('computeCouponPricing', () => {
  it('computes a percent discount', () => {
    const result = computeCouponPricing(
      new Prisma.Decimal('1000.00'),
      CouponValueType.percent,
      new Prisma.Decimal('10.00'),
    );
    expect(result.discountAmount.toFixed(2)).toBe('100.00');
    expect(result.finalPrice.toFixed(2)).toBe('900.00');
  });

  it('computes a fixed discount', () => {
    const result = computeCouponPricing(
      new Prisma.Decimal('1000.00'),
      CouponValueType.fixed,
      new Prisma.Decimal('200.00'),
    );
    expect(result.discountAmount.toFixed(2)).toBe('200.00');
    expect(result.finalPrice.toFixed(2)).toBe('800.00');
  });

  it('caps a percent discount at the original price and never goes negative', () => {
    const result = computeCouponPricing(
      new Prisma.Decimal('1000.00'),
      CouponValueType.percent,
      new Prisma.Decimal('150.00'),
    );
    expect(result.discountAmount.toFixed(2)).toBe('1000.00');
    expect(result.finalPrice.toFixed(2)).toBe('0.00');
  });

  it('caps a fixed discount larger than the price at the original price', () => {
    const result = computeCouponPricing(
      new Prisma.Decimal('500.00'),
      CouponValueType.fixed,
      new Prisma.Decimal('900.00'),
    );
    expect(result.discountAmount.toFixed(2)).toBe('500.00');
    expect(result.finalPrice.toFixed(2)).toBe('0.00');
  });
});
