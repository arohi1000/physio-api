import { zonedWallClockToUtc } from '../../src/modules/availability/timezone.util';

const KOLKATA = 'Asia/Kolkata';

/**
 * A local calendar date, far enough in the future to never collide with
 * another test run's data and guaranteed to be a Monday — a working day
 * under every fixture this suite seeds (`Mon-Fri 09:00-13:00 & 16:00-19:00`).
 *
 * Derived purely from the date string's own weekday (timezone-independent —
 * any `Y-M-D` has exactly one weekday), the same technique
 * `weekdayOfLocalDate` uses in the slot engine itself.
 */
export function nextWorkingMonday(daysOut = 30): string {
  const base = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000);
  const day = base.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilMonday = (8 - day) % 7 || 7;
  const monday = new Date(
    base.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000,
  );
  return monday.toISOString().slice(0, 10);
}

/** The UTC instant for a local `HH:mm` on that Monday, Asia/Kolkata. */
export function slotStartsAt(date: string, localTime: string): string {
  return zonedWallClockToUtc(date, localTime, KOLKATA).toISOString();
}

export interface BookingPayloadOverrides {
  readonly serviceId: string;
  readonly startsAt: string;
  readonly name?: string;
  readonly phone?: string;
  readonly couponCode?: string | null;
  readonly consentGiven?: boolean;
}

export function bookingPayload(overrides: BookingPayloadOverrides) {
  const phone =
    overrides.phone ??
    `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  return {
    serviceId: overrides.serviceId,
    startsAt: overrides.startsAt,
    patient: { name: overrides.name ?? 'Test Patient', phone, email: null },
    reasonForVisit: 'general_assessment',
    couponCode: overrides.couponCode ?? null,
    paymentPreference: 'clinic',
    consentGiven: overrides.consentGiven ?? true,
    captchaToken: null,
  };
}
