import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * `HttpException`'s object constructor form stores the payload verbatim — it
 * does not synthesise the textual `error` field the way its string-message
 * constructor does. M2-CONTRACT.md §1's error envelope example shows
 * `"error": "Conflict"` alongside the numeric `statusCode`, so it is supplied
 * explicitly here for the status codes these exceptions use.
 */
const REASON_PHRASE: Readonly<Partial<Record<HttpStatus, string>>> = {
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
};

/**
 * Base for every exception that carries one of the stable, machine-readable
 * `code` values M2-CONTRACT.md §1 fixes. Clients branch on `code`, never on
 * `message` — `AllExceptionsFilter` reads this shape and copies `code`
 * straight into the error envelope.
 */
export class AppException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ code, message, error: REASON_PHRASE[status] }, status);
  }
}

export class SlotUnavailableException extends AppException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'SLOT_UNAVAILABLE',
      'That time is no longer available.',
    );
  }
}

export class SlotOutsideAvailabilityException extends AppException {
  // The message narrows *why* a time is unbookable — already past, versus
  // outside working hours. The `code` stays the same either way, because
  // clients branch on the code and only show the message.
  constructor(message = 'That time is not a bookable slot.') {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'SLOT_OUTSIDE_AVAILABILITY',
      message,
    );
  }
}

export class ConsentRequiredException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CONSENT_REQUIRED',
      'Consent is required to complete a booking.',
    );
  }
}

export class CouponNotFoundException extends AppException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'COUPON_NOT_FOUND', 'No such coupon code.');
  }
}

export class CouponExpiredException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'COUPON_EXPIRED',
      'This coupon is no longer valid.',
    );
  }
}

export class CouponInactiveException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'COUPON_INACTIVE',
      'This coupon is not currently active.',
    );
  }
}

export class CouponMaxUsesException extends AppException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'COUPON_MAX_USES',
      'This coupon has reached its usage limit.',
    );
  }
}

export class RescheduleTokenInvalidException extends AppException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      'RESCHEDULE_TOKEN_INVALID',
      'This reschedule link is invalid or has expired.',
    );
  }
}

export class AppointmentNotCancellableException extends AppException {
  // Covers both "cannot cancel" and "cannot reschedule": in each case the
  // appointment has left the `booked` state and is no longer live.
  constructor(message = 'This appointment can no longer be cancelled.') {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'APPOINTMENT_NOT_CANCELLABLE',
      message,
    );
  }
}
