import { isSellableSeat, passengerSeatCount, seatLayout } from './seat-layout';

describe('seatLayout', () => {
  it('car_4 has 3 sellable seats and one driver seat', () => {
    const l = seatLayout('car_4');
    expect(l.passengerSeatIds.length).toBe(3);
    expect(l.rows.flat().filter((c) => c.kind === 'driver').length).toBe(1);
  });

  it('car_7 has 6 sellable seats across 3 rows', () => {
    const l = seatLayout('car_7');
    expect(l.passengerSeatIds.length).toBe(6);
    expect(l.rows.length).toBe(3);
  });

  it('van_16 has 15 sellable seats', () => {
    expect(passengerSeatCount('van_16')).toBe(15);
  });

  it('limousine has 6 sellable seats', () => {
    expect(passengerSeatCount('limousine')).toBe(6);
  });

  it('seat ids are stable and unique', () => {
    const l = seatLayout('car_7');
    const ids = l.rows.flat().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(l.passengerSeatIds).toContain('R2-1');
  });

  it('validates sellable seats and rejects the driver seat', () => {
    expect(isSellableSeat('car_7', 'R2-1')).toBe(true);
    expect(isSellableSeat('car_7', 'R1-1')).toBe(false); // driver
    expect(isSellableSeat('car_7', 'R9-9')).toBe(false); // nonexistent
  });
});
