import { DEFAULT_BRACKETS, quoteFare, ratePerKm } from './pricing';

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
