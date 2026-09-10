import { expandBlock } from './rrule-expander';

describe('expandBlock', () => {
  it('yields a single interval for a non-recurring block overlapping the range', () => {
    const block = {
      startDatetime: new Date('2026-03-05T09:00:00.000Z'),
      endDatetime: new Date('2026-03-05T10:00:00.000Z'),
      recurringRule: null,
    };

    const result = expandBlock(
      block,
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-10T00:00:00.000Z'),
    );

    expect(result).toEqual([
      { startsAt: block.startDatetime, endsAt: block.endDatetime },
    ]);
  });

  it('omits a non-recurring block entirely outside the range', () => {
    const block = {
      startDatetime: new Date('2026-03-05T09:00:00.000Z'),
      endDatetime: new Date('2026-03-05T10:00:00.000Z'),
      recurringRule: null,
    };

    const result = expandBlock(
      block,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result).toEqual([]);
  });

  it('expands a weekly recurring block onto every matching date in the range', () => {
    // Thursday 09:00-10:00 UTC, weekly, unbounded.
    const block = {
      startDatetime: new Date('2026-03-05T09:00:00.000Z'),
      endDatetime: new Date('2026-03-05T10:00:00.000Z'),
      recurringRule: 'FREQ=WEEKLY',
    };

    const result = expandBlock(
      block,
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-22T00:00:00.000Z'),
    );

    expect(result.map((interval) => interval.startsAt.toISOString())).toEqual([
      '2026-03-05T09:00:00.000Z',
      '2026-03-12T09:00:00.000Z',
      '2026-03-19T09:00:00.000Z',
    ]);
    // Each occurrence keeps the source block's one-hour duration.
    expect(
      result.every(
        (interval) =>
          interval.endsAt.getTime() - interval.startsAt.getTime() ===
          60 * 60 * 1000,
      ),
    ).toBe(true);
  });

  it('respects a COUNT limit on the recurring rule', () => {
    const block = {
      startDatetime: new Date('2026-03-05T09:00:00.000Z'),
      endDatetime: new Date('2026-03-05T10:00:00.000Z'),
      recurringRule: 'FREQ=WEEKLY;COUNT=2',
    };

    const result = expandBlock(
      block,
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(result).toHaveLength(2);
  });

  it('includes an occurrence that starts before the range but still overlaps it', () => {
    const block = {
      startDatetime: new Date('2026-03-05T23:00:00.000Z'),
      endDatetime: new Date('2026-03-06T01:00:00.000Z'),
      recurringRule: null,
    };

    const result = expandBlock(
      block,
      new Date('2026-03-06T00:00:00.000Z'),
      new Date('2026-03-07T00:00:00.000Z'),
    );

    expect(result).toHaveLength(1);
  });
});
