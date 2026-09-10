/**
 * Shape of `clinic_settings.working_hours` — the weekly working-hours template
 * the slot engine subtracts availability blocks from (TRD §4.4).
 *
 * Times are local wall-clock in `clinic_settings.timezone`, 24-hour `HH:mm`.
 * A day with no intervals is a closed day.
 *
 * Keys are the three-letter weekday abbreviations fixed by M2-CONTRACT.md §3
 * (`{ "mon": [...], "sun": [] }`). M1 originally used full weekday names
 * (`monday`..`sunday`); that shape was never exposed over HTTP, so it is
 * changed here to match the contract exactly rather than translating between
 * an internal and a wire shape.
 */
export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

// A type alias rather than an interface: only aliases get the implicit index
// signature Prisma's `InputJsonValue` requires when this is written to JSONB.
export type WorkingInterval = {
  readonly start: string;
  readonly end: string;
};

export type WeeklyWorkingHours = Readonly<Record<Weekday, WorkingInterval[]>>;

/** JavaScript's `Date#getUTCDay()` (0 = Sunday) indexed to our weekday keys. */
export const WEEKDAY_BY_JS_DAY_INDEX: Readonly<Record<number, Weekday>> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};
