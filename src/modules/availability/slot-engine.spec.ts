import { computeAvailableSlots, isWithinAvailability } from './slot-engine';
import type { SlotEngineInput } from './slot-engine.types';
import type { WeeklyWorkingHours } from '../clinic-settings/clinic-settings.types';
import { zonedWallClockToUtc } from './timezone.util';

const KOLKATA = 'Asia/Kolkata';

const CLOSED_WEEK: WeeklyWorkingHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

function baseInput(overrides: Partial<SlotEngineInput> = {}): SlotEngineInput {
  return {
    date: '2026-03-05', // a Thursday
    timezone: KOLKATA,
    durationMinutes: 45,
    bufferMinutes: 0,
    workingHours: CLOSED_WEEK,
    blocks: [],
    bookedAppointments: [],
    ...overrides,
  };
}

describe('computeAvailableSlots — timezone boundary (write these first)', () => {
  it('converts a 09:00 Asia/Kolkata slot to the correct UTC instant (03:30Z)', () => {
    const slots = computeAvailableSlots(
      baseInput({
        workingHours: {
          ...CLOSED_WEEK,
          thu: [{ start: '09:00', end: '09:45' }],
        },
      }),
    );

    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-05T03:30:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-03-05T04:15:00.000Z');
  });

  it('places an early-morning local slot on the previous UTC calendar day', () => {
    // 00:30 IST on 2026-03-05 is 18:30 UTC on 2026-03-04 — the local calendar
    // date and the UTC calendar date disagree here, which is exactly the trap
    // a naive `new Date(dateStr + 'T' + time)` implementation falls into.
    const slots = computeAvailableSlots(
      baseInput({
        workingHours: {
          ...CLOSED_WEEK,
          thu: [{ start: '00:30', end: '01:15' }],
        },
      }),
    );

    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-04T19:00:00.000Z');
  });

  it('resolves the weekday from the local calendar date, not the UTC date', () => {
    // Sunday 2026-03-08, closed. A UTC-naive implementation might resolve a
    // late-evening slot to Monday in UTC and pick up Monday's hours instead.
    const slots = computeAvailableSlots(
      baseInput({
        date: '2026-03-08',
        workingHours: { ...CLOSED_WEEK, sun: [] },
      }),
    );
    expect(slots).toHaveLength(0);
  });
});

describe('computeAvailableSlots — working-hours windows', () => {
  it('produces slots across two separate working windows in a day', () => {
    const slots = computeAvailableSlots(
      baseInput({
        workingHours: {
          ...CLOSED_WEEK,
          thu: [
            { start: '09:00', end: '13:00' },
            { start: '16:00', end: '19:00' },
          ],
        },
      }),
    );

    // Morning window: 09:00-13:00 in 45-min steps → 09:00,09:45,10:30,11:15,12:00,12:45(ends 13:30 > 13:00, excluded)
    // Evening window: 16:00-19:00 → 16:00,16:45,17:30,18:15(ends 19:00, included)
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-03-05T03:30:00.000Z', // 09:00 IST
      '2026-03-05T04:15:00.000Z', // 09:45 IST
      '2026-03-05T05:00:00.000Z', // 10:30 IST
      '2026-03-05T05:45:00.000Z', // 11:15 IST
      '2026-03-05T06:30:00.000Z', // 12:00 IST
      '2026-03-05T10:30:00.000Z', // 16:00 IST
      '2026-03-05T11:15:00.000Z', // 16:45 IST
      '2026-03-05T12:00:00.000Z', // 17:30 IST
      '2026-03-05T12:45:00.000Z', // 18:15 IST
    ]);
  });

  it('does not offer a trailing partial slot when duration does not divide the window evenly', () => {
    // 60-minute service in a 09:00-13:00 (240 min) window with no buffer:
    // 240 / 60 = 4 exactly, so this case alone wouldn't expose a remainder —
    // use a 13:20 close instead so the last full slot ends at 13:00 and the
    // remaining 20 minutes must not become a short slot.
    const slots = computeAvailableSlots(
      baseInput({
        durationMinutes: 60,
        workingHours: {
          ...CLOSED_WEEK,
          thu: [{ start: '09:00', end: '13:20' }],
        },
      }),
    );

    expect(slots).toHaveLength(4);
    expect(slots[3].endsAt.toISOString()).toBe(
      zonedWallClockToUtc('2026-03-05', '13:00', KOLKATA).toISOString(),
    );
  });

  it('returns no slots on a closed day', () => {
    const slots = computeAvailableSlots(
      baseInput({ workingHours: CLOSED_WEEK }),
    );
    expect(slots).toEqual([]);
  });
});

describe('computeAvailableSlots — blocks', () => {
  const morningOnly: WeeklyWorkingHours = {
    ...CLOSED_WEEK,
    thu: [{ start: '09:00', end: '13:00' }],
  };

  it('excludes slots that partially overlap an availability block', () => {
    // Block 10:00-11:00 IST overlaps the 09:45-10:30 and 10:30-11:15 slots.
    const slots = computeAvailableSlots(
      baseInput({
        workingHours: morningOnly,
        blocks: [
          {
            startsAt: zonedWallClockToUtc('2026-03-05', '10:00', KOLKATA),
            endsAt: zonedWallClockToUtc('2026-03-05', '11:00', KOLKATA),
          },
        ],
      }),
    );

    const starts = slots.map((slot) => slot.startsAt.toISOString());
    expect(starts).toContain(
      zonedWallClockToUtc('2026-03-05', '09:00', KOLKATA).toISOString(),
    );
    expect(starts).not.toContain(
      zonedWallClockToUtc('2026-03-05', '09:45', KOLKATA).toISOString(),
    );
    expect(starts).not.toContain(
      zonedWallClockToUtc('2026-03-05', '10:30', KOLKATA).toISOString(),
    );
    expect(starts).toContain(
      zonedWallClockToUtc('2026-03-05', '11:15', KOLKATA).toISOString(),
    );
  });

  it('excludes slots from a recurring block expanded onto this date', () => {
    // Simulates a weekly recurring block already expanded for 2026-03-05.
    const slots = computeAvailableSlots(
      baseInput({
        workingHours: morningOnly,
        blocks: [
          {
            startsAt: zonedWallClockToUtc('2026-03-05', '09:00', KOLKATA),
            endsAt: zonedWallClockToUtc('2026-03-05', '13:00', KOLKATA),
          },
        ],
      }),
    );

    expect(slots).toEqual([]);
  });
});

describe('computeAvailableSlots — a fully booked day', () => {
  it('returns no slots when every grid slot already has a booked appointment', () => {
    const workingHours: WeeklyWorkingHours = {
      ...CLOSED_WEEK,
      thu: [{ start: '09:00', end: '09:45' }],
    };
    const slots = computeAvailableSlots(
      baseInput({
        workingHours,
        bookedAppointments: [
          {
            startsAt: zonedWallClockToUtc('2026-03-05', '09:00', KOLKATA),
            endsAt: zonedWallClockToUtc('2026-03-05', '09:45', KOLKATA),
          },
        ],
      }),
    );

    expect(slots).toEqual([]);
  });
});

describe('computeAvailableSlots — buffer between appointments', () => {
  it('spaces slots by duration + buffer', () => {
    const slots = computeAvailableSlots(
      baseInput({
        durationMinutes: 30,
        bufferMinutes: 15,
        workingHours: {
          ...CLOSED_WEEK,
          thu: [{ start: '09:00', end: '10:30' }],
        },
      }),
    );

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      zonedWallClockToUtc('2026-03-05', '09:00', KOLKATA).toISOString(),
      zonedWallClockToUtc('2026-03-05', '09:45', KOLKATA).toISOString(),
    ]);
  });
});

describe('isWithinAvailability', () => {
  const workingHours: WeeklyWorkingHours = {
    ...CLOSED_WEEK,
    thu: [{ start: '09:00', end: '10:30' }],
  };

  it('is true for a grid-aligned slot even when it is already booked', () => {
    const candidate = {
      startsAt: zonedWallClockToUtc('2026-03-05', '09:00', KOLKATA),
      endsAt: zonedWallClockToUtc('2026-03-05', '09:45', KOLKATA),
    };
    expect(
      isWithinAvailability(candidate, {
        date: '2026-03-05',
        timezone: KOLKATA,
        durationMinutes: 45,
        bufferMinutes: 0,
        workingHours,
        blocks: [],
      }),
    ).toBe(true);
  });

  it('is false for a time outside working hours', () => {
    const candidate = {
      startsAt: zonedWallClockToUtc('2026-03-05', '20:00', KOLKATA),
      endsAt: zonedWallClockToUtc('2026-03-05', '20:45', KOLKATA),
    };
    expect(
      isWithinAvailability(candidate, {
        date: '2026-03-05',
        timezone: KOLKATA,
        durationMinutes: 45,
        bufferMinutes: 0,
        workingHours,
        blocks: [],
      }),
    ).toBe(false);
  });

  it('is false for a misaligned time inside working hours', () => {
    // 09:15 is inside the window but is not a grid-aligned slot start for a
    // 45-minute service starting the grid at 09:00.
    const candidate = {
      startsAt: zonedWallClockToUtc('2026-03-05', '09:15', KOLKATA),
      endsAt: zonedWallClockToUtc('2026-03-05', '10:00', KOLKATA),
    };
    expect(
      isWithinAvailability(candidate, {
        date: '2026-03-05',
        timezone: KOLKATA,
        durationMinutes: 45,
        bufferMinutes: 0,
        workingHours,
        blocks: [],
      }),
    ).toBe(false);
  });
});
