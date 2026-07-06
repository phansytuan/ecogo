import { canFit, freeSeatsOnSegment, maxOverlapSeats, tightestFreeSeats, Seg } from './segment-capacity';

describe('per-segment seat accounting', () => {
  it('non-overlapping segments do not compete (1-seat car serves both)', () => {
    const segs: Seg[] = [{ fp: 0.0, fd: 0.3, seats: 1 }];
    // new booking on a later, disjoint segment
    expect(canFit(segs, 1, 0.5, 0.8, 1)).toBe(true);
    expect(maxOverlapSeats(segs, 0.5, 0.8)).toBe(0);
  });

  it('overlapping segments compete', () => {
    const segs: Seg[] = [{ fp: 0.1, fd: 0.6, seats: 1 }];
    expect(canFit(segs, 1, 0.4, 0.9, 1)).toBe(false); // overlap on [0.4,0.6)
    expect(canFit(segs, 2, 0.4, 0.9, 1)).toBe(true);
  });

  it('touching endpoints do not conflict (half-open)', () => {
    const segs: Seg[] = [{ fp: 0.0, fd: 0.4, seats: 1 }];
    expect(canFit(segs, 1, 0.4, 0.8, 1)).toBe(true);
    expect(maxOverlapSeats(segs, 0.4, 0.8)).toBe(0);
  });

  it('sums multi-seat overlapping bookings', () => {
    const segs: Seg[] = [
      { fp: 0.0, fd: 0.5, seats: 2 },
      { fp: 0.2, fd: 0.7, seats: 1 },
    ];
    expect(maxOverlapSeats(segs, 0.0, 1.0)).toBe(3); // both overlap on [0.2,0.5)
    expect(canFit(segs, 4, 0.3, 0.9, 1)).toBe(true);
    expect(canFit(segs, 3, 0.3, 0.6, 1)).toBe(false);
  });

  it('freeSeatsOnSegment and tightestFreeSeats', () => {
    const segs: Seg[] = [{ fp: 0.0, fd: 0.5, seats: 2 }];
    expect(freeSeatsOnSegment(segs, 4, 0.6, 0.9)).toBe(4); // free after 0.5
    expect(freeSeatsOnSegment(segs, 4, 0.1, 0.3)).toBe(2); // 2 taken
    expect(tightestFreeSeats(segs, 4)).toBe(2);
  });
});
