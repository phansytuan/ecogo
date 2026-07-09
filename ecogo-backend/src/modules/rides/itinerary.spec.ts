import { buildItinerary, etaOffsetsFromLegs } from './itinerary';

describe('buildItinerary', () => {
  const bookings = [
    { id: 'b2', fp: 0.5, fd: 0.8, pickupLabel: 'C', dropoffLabel: 'D', passengerName: 'P2' },
    { id: 'b1', fp: 0.2, fd: 0.6, pickupLabel: 'A', dropoffLabel: 'B', passengerName: 'P1' },
  ];

  it('orders stops along the route with origin first and dest last', () => {
    const stops = buildItinerary(bookings, 10000, 'Origin', 'Dest');
    expect(stops.map((s) => s.kind)).toEqual([
      'origin', 'pickup', 'pickup', 'dropoff', 'dropoff', 'dest',
    ]);
    expect(stops[0].label).toBe('Origin');
    expect(stops[stops.length - 1].label).toBe('Dest');
  });

  it('eta offset is fraction * duration', () => {
    const stops = buildItinerary(bookings, 10000, null, null);
    const firstPickup = stops.find((s) => s.kind === 'pickup')!;
    expect(firstPickup.fraction).toBe(0.2);
    expect(firstPickup.etaOffsetS).toBe(2000);
  });
});

describe('etaOffsetsFromLegs', () => {
  it('accumulates real leg durations', () => {
    // 2 intermediate stops -> 3 legs
    const offsets = etaOffsetsFromLegs(2, [600, 900, 1200], 2700, [0.2, 0.6]);
    expect(offsets).toEqual([600, 1500]);
  });

  it('falls back to proportional estimates without a leg breakdown', () => {
    const offsets = etaOffsetsFromLegs(2, undefined, 10000, [0.2, 0.6]);
    expect(offsets).toEqual([2000, 6000]);
  });

  it('falls back when the leg count does not match the stops', () => {
    const offsets = etaOffsetsFromLegs(2, [600], 10000, [0.2, 0.6]);
    expect(offsets).toEqual([2000, 6000]);
  });

  it('handles a route with no intermediate stops', () => {
    expect(etaOffsetsFromLegs(0, [3600], 3600, [])).toEqual([]);
  });
});
