import { weekdayOfLocalDate, zonedWallClockToUtc } from './timezone.util';
import type { Slot, SlotEngineInput, TimeInterval } from './slot-engine.types';

const MINUTES_TO_MS = 60_000;

/** True when the two half-open intervals `[startsAt, endsAt)` overlap. */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function overlapsAny(
  candidate: TimeInterval,
  intervals: readonly TimeInterval[],
): boolean {
  return intervals.some((interval) => intervalsOverlap(candidate, interval));
}

/**
 * Pure, unit-testable slot computation (M2-CONTRACT.md §5.4). Given a local
 * calendar date, a service duration, the weekly working-hours template,
 * already-expanded availability blocks and currently-booked appointments,
 * returns the bookable slots for that date — sorted, non-overlapping, each
 * exactly `durationMinutes` long.
 *
 * Everything is computed and returned in UTC; the only place local wall-clock
 * time enters is converting each working-hours interval's `HH:mm` boundary to
 * a UTC instant for this specific calendar date.
 */
export function computeAvailableSlots(input: SlotEngineInput): Slot[] {
  const weekday = weekdayOfLocalDate(input.date);
  const dayIntervals = input.workingHours[weekday] ?? [];
  const stepMs = (input.durationMinutes + input.bufferMinutes) * MINUTES_TO_MS;
  const durationMs = input.durationMinutes * MINUTES_TO_MS;

  const slots: Slot[] = [];

  for (const window of dayIntervals) {
    const windowStart = zonedWallClockToUtc(
      input.date,
      window.start,
      input.timezone,
    );
    const windowEnd = zonedWallClockToUtc(
      input.date,
      window.end,
      input.timezone,
    );

    let candidateStartMs = windowStart.getTime();
    while (candidateStartMs + durationMs <= windowEnd.getTime()) {
      const candidate: Slot = {
        startsAt: new Date(candidateStartMs),
        endsAt: new Date(candidateStartMs + durationMs),
      };

      if (
        !overlapsAny(candidate, input.blocks) &&
        !overlapsAny(candidate, input.bookedAppointments)
      ) {
        slots.push(candidate);
      }

      candidateStartMs += stepMs;
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Whether `candidate` is a legitimate slot boundary for the day — i.e. it
 * would appear in {@link computeAvailableSlots} if nothing were booked yet.
 * Used by the booking transaction to distinguish "not a real slot"
 * (`SLOT_OUTSIDE_AVAILABILITY`) from "a real slot, but just taken"
 * (`SLOT_UNAVAILABLE`).
 */
export function isWithinAvailability(
  candidate: TimeInterval,
  input: Omit<SlotEngineInput, 'bookedAppointments'>,
): boolean {
  const grid = computeAvailableSlots({ ...input, bookedAppointments: [] });
  return grid.some(
    (slot) =>
      slot.startsAt.getTime() === candidate.startsAt.getTime() &&
      slot.endsAt.getTime() === candidate.endsAt.getTime(),
  );
}
