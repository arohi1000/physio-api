import type { WeeklyWorkingHours } from '../clinic-settings/clinic-settings.types';

/** A half-open UTC instant interval: `[startsAt, endsAt)`. */
export interface TimeInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export type Slot = TimeInterval;

export interface SlotEngineInput {
  /** Local calendar date, `YYYY-MM-DD`, in `timezone`. */
  readonly date: string;
  readonly timezone: string;
  readonly durationMinutes: number;
  readonly bufferMinutes: number;
  readonly workingHours: WeeklyWorkingHours;
  /** Already-expanded (recurring rules resolved), as UTC instants. */
  readonly blocks: readonly TimeInterval[];
  /** Currently `booked`, non-deleted appointments, as UTC instants. */
  readonly bookedAppointments: readonly TimeInterval[];
}
