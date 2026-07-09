import { actualGapMinutes, earliestNextDeparture, estimatedGapMinutes } from './scheduling';

describe('scheduling gaps', () => {
  it('325 km => 2h actual, 4h estimated', () => {
    expect(actualGapMinutes(325)).toBeCloseTo(120, 5);
    expect(estimatedGapMinutes(325)).toBeCloseTo(240, 5);
  });
  it('scales proportionally for shorter routes', () => {
    expect(actualGapMinutes(162.5)).toBeCloseTo(60, 5);
  });
  it('uses actual completion + shorter gap when completed', () => {
    const completedAt = new Date('2026-07-01T10:00:00Z');
    const e = earliestNextDeparture({ departure: new Date('2026-07-01T04:00:00Z'), durationS: 18000, completedAt, km: 325 });
    expect(e.toISOString()).toBe('2026-07-01T12:00:00.000Z'); // +2h
  });
  it('uses estimated completion + longer gap when not completed', () => {
    const departure = new Date('2026-07-01T04:00:00Z');
    const e = earliestNextDeparture({ departure, durationS: 18000, completedAt: null, km: 325 }); // +5h duration
    // completion 09:00 + 4h = 13:00
    expect(e.toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });
});

describe('completing a ride shortens the required gap', () => {
  const departure = new Date('2026-07-01T04:00:00Z');
  const durationS = 18000; // 5h -> estimated completion 09:00
  const km = 325;

  it('actual completion allows an earlier next departure than the estimate', () => {
    const estimated = earliestNextDeparture({ departure, durationS, completedAt: null, km });
    // driver actually finished early, at 08:00
    const actual = earliestNextDeparture({
      departure,
      durationS,
      completedAt: new Date('2026-07-01T08:00:00Z'),
      km,
    });
    expect(actual.getTime()).toBeLessThan(estimated.getTime());
    expect(actual.toISOString()).toBe('2026-07-01T10:00:00.000Z'); // 08:00 + 2h
    expect(estimated.toISOString()).toBe('2026-07-01T13:00:00.000Z'); // 09:00 + 4h
  });

  it('a late actual completion still applies the shorter 2h-class gap', () => {
    const actual = earliestNextDeparture({
      departure,
      durationS,
      completedAt: new Date('2026-07-01T11:00:00Z'), // ran 2h over
      km,
    });
    expect(actual.toISOString()).toBe('2026-07-01T13:00:00.000Z'); // 11:00 + 2h
  });

  it('short routes scale both branches proportionally', () => {
    const shortKm = 162.5; // half of 325
    const completedAt = new Date('2026-07-01T08:00:00Z');
    const actual = earliestNextDeparture({ departure, durationS: 9000, completedAt, km: shortKm });
    expect(actual.toISOString()).toBe('2026-07-01T09:00:00.000Z'); // +1h (half of 2h)
  });
});
