/**
 * Shape of `clinic_settings.working_hours` — the weekly working-hours template
 * the slot engine subtracts availability blocks from (TRD §4.4).
 *
 * Times are local wall-clock in `clinic_settings.timezone`, 24-hour `HH:mm`.
 * A day with no intervals is a closed day.
 */
export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

// A type alias rather than an interface: only aliases get the implicit index
// signature Prisma's `InputJsonValue` requires when this is written to JSONB.
export type WorkingInterval = {
  readonly start: string;
  readonly end: string;
};

export type WeeklyWorkingHours = Readonly<Record<Weekday, WorkingInterval[]>>;
