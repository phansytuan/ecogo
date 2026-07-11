import { haversineKm, polylineKm } from './geo';

describe('geo', () => {
  it('one degree of latitude is ~111 km', () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.19, 0);
  });
  it('polyline sums its legs', () => {
    const km = polylineKm([[0, 0], [0, 1], [0, 2]]);
    expect(km).toBeCloseTo(222.38, 0);
  });
  it('empty / single-point polyline is 0', () => {
    expect(polylineKm([])).toBe(0);
    expect(polylineKm([[10, 10]])).toBe(0);
  });
});
