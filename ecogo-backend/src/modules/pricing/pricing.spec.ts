import { fareForDistanceM, quoteFare, ratePerKm } from './pricing';

describe('pricing', () => {
  it('selects the rate for the distance bracket', () => {
    expect(ratePerKm(30)).toBe(1800); // <=50
    expect(ratePerKm(120)).toBe(1400); // <=150
    expect(ratePerKm(250)).toBe(1150); // <=300
    expect(ratePerKm(400)).toBe(1000); // >300
  });
  it('fare = km x rate, rounded to nearest 1,000', () => {
    expect(quoteFare(100)).toBe(140000); // 100 * 1400
    expect(quoteFare(325)).toBe(325000); // 325 * 1000
    expect(quoteFare(0)).toBe(0);
  });
  it('longer trips are cheaper per km', () => {
    const shortPerKm = quoteFare(40) / 40;
    const longPerKm = quoteFare(320) / 320;
    expect(longPerKm).toBeLessThan(shortPerKm);
  });
  it('respects a custom bracket table', () => {
    const custom = [{ maxKm: Infinity, ratePerKm: 2000 }];
    expect(quoteFare(10, custom)).toBe(20000);
  });
});

describe('fareForDistanceM (integer-safe passenger fare)', () => {
  it('fare = distance x rate: 100 km at 1400đ/km = 140,000đ/seat', () => {
    expect(fareForDistanceM(100_000)).toEqual({
      farePerSeat: 140_000,
      ratePerKm: 1400,
      distanceM: 100_000,
    });
  });

  it('agrees with the km-based quote at bracket boundaries', () => {
    for (const km of [1, 49.9, 50, 50.1, 150, 300, 301, 500]) {
      expect(fareForDistanceM(km * 1000).farePerSeat).toBe(quoteFare(km));
    }
  });

  it('rounds to the nearest 1,000đ using integer arithmetic', () => {
    // 123,456 m in the <=150 km bracket at 1400đ/km = 172,838.4đ -> 173,000đ
    expect(fareForDistanceM(123_456).farePerSeat).toBe(173_000);
  });

  it('is deterministic for fractional-meter inputs (no float drift)', () => {
    expect(fareForDistanceM(100_000.4)).toEqual(fareForDistanceM(100_000));
  });

  it('returns zero fare for zero or negative distance', () => {
    expect(fareForDistanceM(0).farePerSeat).toBe(0);
    expect(fareForDistanceM(-5).farePerSeat).toBe(0);
    expect(fareForDistanceM(-5).distanceM).toBe(0);
  });
});
