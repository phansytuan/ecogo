import { MatchCandidateRow } from './matching.types';
import { etaPickupMs, rankCandidates, scoreCandidate } from './ranking';

function row(over: Partial<MatchCandidateRow>): MatchCandidateRow {
  return {
    id: 'r',
    driver_id: 'd',
    vehicle_id: 'v',
    origin_label: 'A',
    dest_label: 'B',
    departure_time: '2026-07-01T06:00:00.000Z',
    created_at: '2026-06-30T06:00:00.000Z',
    available_seats: 3,
    total_seats: 4,
    price_per_seat: '200000',
    duration_s: 7200, // 2h end-to-end
    distance_m: '300000',
    driver_name: 'Drv',
    driver_rating: '4.8',
    fp: 0.3,
    fd: 0.6,
    pickup_off_m: 500,
    dropoff_off_m: 500,
    shared_m: 30000,
    ...over,
  };
}

describe('matching ranking', () => {
  it('computes ETA at pickup from departure + fp*duration', () => {
    const r = row({ fp: 0.5, duration_s: 7200, departure_time: '2026-07-01T06:00:00.000Z' });
    // 0.5 * 7200s = 3600s = 1h after 06:00 -> 07:00
    expect(new Date(etaPickupMs(r)).toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });

  it('prefers lower off-route distance', () => {
    const near = row({ id: 'near', pickup_off_m: 200, dropoff_off_m: 200 });
    const far = row({ id: 'far', pickup_off_m: 2500, dropoff_off_m: 2500 });
    const ranked = rankCandidates([far, near]);
    expect(ranked[0].rideId).toBe('near');
  });

  it('prefers higher-rated driver when offsets are equal', () => {
    const hi = row({ id: 'hi', driver_rating: '4.9' });
    const lo = row({ id: 'lo', driver_rating: '3.5' });
    const ranked = rankCandidates([lo, hi]);
    expect(ranked[0].rideId).toBe('hi');
  });

  it('penalises pickup-time mismatch when a desired time is given', () => {
    const onTime = row({ id: 'onTime', fp: 0.5, duration_s: 7200 }); // ETA 07:00
    const early = row({ id: 'early', fp: 0.1, duration_s: 7200 }); // ETA ~06:12
    const desired = new Date('2026-07-01T07:00:00.000Z');
    const ranked = rankCandidates([early, onTime], { desiredPickup: desired });
    expect(ranked[0].rideId).toBe('onTime');
  });

  it('score is lower (better) for a closer, better-rated, on-time candidate', () => {
    const good = scoreCandidate(row({ pickup_off_m: 100, dropoff_off_m: 100, driver_rating: '5.0' }));
    const bad = scoreCandidate(row({ pickup_off_m: 3000, dropoff_off_m: 3000, driver_rating: '3.0' }));
    expect(good).toBeLessThan(bad);
  });
});
