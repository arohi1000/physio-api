import {
  WEEKDAY_BY_JS_DAY_INDEX,
  type Weekday,
} from '../clinic-settings/clinic-settings.types';

/**
 * Everything the slot engine needs to cross the local-wall-clock ↔ UTC
 * boundary correctly (M2-CONTRACT.md §5.4: "write the timezone cases before
 * the implementation").
 *
 * Uses `Intl.DateTimeFormat` to read the target zone's offset at a given
 * instant rather than hard-coding `+05:30` for Asia/Kolkata. Asia/Kolkata
 * never observes DST, so a fixed offset would work today, but
 * `clinic_settings.timezone` is a configurable string — deriving the offset
 * from the IANA database via `Intl` keeps this correct if that ever changes,
 * at no extra cost (Node ships full ICU).
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Minutes to add to a UTC instant to get that zone's local wall-clock time,
 * i.e. `local = utc + offsetMinutes`. Positive east of UTC (Asia/Kolkata is
 * +330).
 */
export function getTimeZoneOffsetMinutes(
  instant: Date,
  timeZone: string,
): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(instant);
  const lookup = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // `asUtc` re-reads the zone's wall-clock digits as if they were UTC, so the
  // difference against the original instant is exactly the zone's offset.
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour') === 24 ? 0 : lookup('hour'),
    lookup('minute'),
    lookup('second'),
  );

  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Converts a local calendar date (`YYYY-MM-DD`) plus a local wall-clock time
 * (`HH:mm`) in `timeZone` to the UTC instant it denotes.
 *
 * One refinement pass: the offset is looked up once using a naive UTC guess,
 * then re-applied, which is exact for any zone whose offset does not change
 * within the few minutes either side of the guess — true for every real
 * zone's transition granularity. Asia/Kolkata never transitions, so a single
 * pass is already exact for the clinic this runs for.
 */
export function zonedWallClockToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const dateMatch = DATE_PATTERN.exec(dateStr);
  const timeMatch = TIME_PATTERN.exec(timeStr);
  if (!dateMatch || !timeMatch) {
    throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;

  const naiveGuessUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
  );

  const offsetMinutes = getTimeZoneOffsetMinutes(
    new Date(naiveGuessUtcMs),
    timeZone,
  );

  return new Date(naiveGuessUtcMs - offsetMinutes * 60_000);
}

/** The UTC instant of local midnight starting the given calendar date. */
export function startOfLocalDayUtc(dateStr: string, timeZone: string): Date {
  return zonedWallClockToUtc(dateStr, '00:00', timeZone);
}

/** The UTC instant of local midnight starting the *next* calendar date. */
export function startOfNextLocalDayUtc(
  dateStr: string,
  timeZone: string,
): Date {
  const dateMatch = DATE_PATTERN.exec(dateStr);
  if (!dateMatch) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  const [, year, month, day] = dateMatch;
  const nextDayUtcNoon = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + 1, 12),
  );
  const nextDateStr = nextDayUtcNoon.toISOString().slice(0, 10);
  return startOfLocalDayUtc(nextDateStr, timeZone);
}

/** The local calendar date (`YYYY-MM-DD`) a UTC instant falls on in `timeZone`. */
export function localDateOfInstant(instant: Date, timeZone: string): string {
  // en-CA's date formatting is YYYY-MM-DD, so no reassembly of the parts is
  // needed.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * The weekday key for a local calendar date. Derived purely from the date
 * string's own components — a calendar date has one weekday regardless of
 * which timezone you interpret it in, so no zone conversion is needed here.
 */
export function weekdayOfLocalDate(dateStr: string): Weekday {
  const dateMatch = DATE_PATTERN.exec(dateStr);
  if (!dateMatch) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  const [, year, month, day] = dateMatch;
  const jsDay = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  ).getUTCDay();
  return WEEKDAY_BY_JS_DAY_INDEX[jsDay];
}
