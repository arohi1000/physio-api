import { RRule } from 'rrule';
import type { TimeInterval } from './slot-engine.types';

export interface RecurringBlockSource {
  readonly startDatetime: Date;
  readonly endDatetime: Date;
  readonly recurringRule: string | null;
}

/** Generous enough to catch any occurrence starting before the query range
 * whose block still runs into it — no availability block in this clinic's use
 * case spans anywhere near this long. */
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Expands one `availability_blocks` row into concrete UTC intervals
 * overlapping `[rangeStart, rangeEnd)`. A non-recurring block yields itself
 * (if it overlaps the range); a recurring block's `recurringRule` (an RRULE
 * string, e.g. `"FREQ=WEEKLY;COUNT=10"`) is anchored to `startDatetime` as
 * DTSTART and expanded, each occurrence keeping the source block's duration.
 *
 * Documented assumption: every recurring block's `startDatetime` falls inside
 * a working-hours window (09:00 IST or later for this clinic), so no
 * occurrence's local calendar date ever disagrees with its UTC calendar date
 * in a way that would shift RRULE's UTC-based weekday/day-of-month math
 * relative to the intended local weekday. A block recurring in the
 * 00:00–05:29 IST window would need timezone-aware RRULE expansion, which
 * this does not implement — out of scope, since the clinic never opens that
 * early.
 */
export function expandBlock(
  block: RecurringBlockSource,
  rangeStart: Date,
  rangeEnd: Date,
): TimeInterval[] {
  const durationMs =
    block.endDatetime.getTime() - block.startDatetime.getTime();

  if (!block.recurringRule) {
    return intervalsOverlappingRange(
      [block.startDatetime],
      durationMs,
      rangeStart,
      rangeEnd,
    );
  }

  const options = RRule.parseString(block.recurringRule);
  const rule = new RRule({ ...options, dtstart: block.startDatetime });
  const lookbackStart = new Date(rangeStart.getTime() - LOOKBACK_MS);
  const occurrences = rule.between(lookbackStart, rangeEnd, true);

  return intervalsOverlappingRange(
    occurrences,
    durationMs,
    rangeStart,
    rangeEnd,
  );
}

function intervalsOverlappingRange(
  starts: readonly Date[],
  durationMs: number,
  rangeStart: Date,
  rangeEnd: Date,
): TimeInterval[] {
  return starts
    .map((startsAt) => ({
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
    }))
    .filter(
      (interval) =>
        interval.startsAt < rangeEnd && interval.endsAt > rangeStart,
    );
}
