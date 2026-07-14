import {
  applyPlan,
  compareByDetour,
  detourMetrics,
  estimatePlanDeltaKm,
  insertionPlans,
  isWithinDetourLimit,
  rankingReason,
} from './detour';

describe('insertionPlans', () => {
  it('has a single plan when the route has no intermediate stops', () => {
    expect(insertionPlans(0)).toEqual([{ pickupIdx: 0, dropoffIdx: 0 }]);
  });

  it('enumerates every pickup-before-dropoff combination', () => {
    const plans = insertionPlans(2); // gaps 0,1,2 -> 3+2+1 = 6 plans
    expect(plans).toHaveLength(6);
    for (const p of plans) expect(p.pickupIdx).toBeLessThanOrEqual(p.dropoffIdx);
  });

  it('never produces a dropoff-before-pickup plan', () => {
    for (const p of insertionPlans(5)) {
      expect(p.dropoffIdx).toBeGreaterThanOrEqual(p.pickupIdx);
    }
  });
});

describe('applyPlan', () => {
  const s1 = { lat: 1, lng: 1 };
  const s2 = { lat: 2, lng: 2 };
  const pick = { lat: 9, lng: 9 };
  const drop = { lat: 8, lng: 8 };

  it('splices pickup before dropoff when both land in the same gap', () => {
    expect(applyPlan([s1, s2], pick, drop, { pickupIdx: 1, dropoffIdx: 1 })).toEqual([
      s1, pick, drop, s2,
    ]);
  });

  it('keeps existing stops in their original order for every plan', () => {
    for (const plan of insertionPlans(2)) {
      const seq = applyPlan([s1, s2], pick, drop, plan);
      const existing = seq.filter((p) => p === s1 || p === s2);
      expect(existing).toEqual([s1, s2]); // order preserved — never reshuffled
      expect(seq.indexOf(pick)).toBeLessThan(seq.indexOf(drop));
    }
  });

  it('handles an empty stop list', () => {
    expect(applyPlan([], pick, drop, { pickupIdx: 0, dropoffIdx: 0 })).toEqual([pick, drop]);
  });
});

describe('estimatePlanDeltaKm', () => {
  const origin = { lat: 18.679, lng: 105.681 }; // Vinh
  const dest = { lat: 21.0278, lng: 105.8342 }; // Hà Nội

  it('estimates ~0 extra for points on the straight corridor', () => {
    const onRoute = { lat: 19.85, lng: 105.757 };
    const onRoute2 = { lat: 20.2, lng: 105.78 };
    const delta = estimatePlanDeltaKm([origin, dest], onRoute, onRoute2, {
      pickupIdx: 0,
      dropoffIdx: 0,
    });
    expect(delta).toBeLessThan(5);
  });

  it('ranks an off-corridor insertion as more expensive', () => {
    const near = { lat: 19.85, lng: 105.757 };
    const far = { lat: 19.85, lng: 106.6 }; // ~90 km east of the corridor
    const cheap = estimatePlanDeltaKm([origin, dest], near, { lat: 20.2, lng: 105.78 }, {
      pickupIdx: 0, dropoffIdx: 0,
    });
    const costly = estimatePlanDeltaKm([origin, dest], far, { lat: 20.2, lng: 105.78 }, {
      pickupIdx: 0, dropoffIdx: 0,
    });
    expect(costly).toBeGreaterThan(cheap);
  });
});

describe('isWithinDetourLimit (max detour rule)', () => {
  it('accepts a matched route exactly at the 120% limit', () => {
    expect(isWithinDetourLimit(360_000, 300_000, 0.2)).toBe(true); // 300 km -> 360 km
    expect(isWithinDetourLimit(540_000, 450_000, 0.2)).toBe(true); // 450 km -> 540 km
  });

  it('accepts detours below the limit', () => {
    expect(isWithinDetourLimit(368_000, 345_000, 0.2)).toBe(true); // 23 km on 345 km
  });

  it('rejects a matched route above the limit', () => {
    expect(isWithinDetourLimit(360_002, 300_000, 0.2)).toBe(false);
    expect(isWithinDetourLimit(420_000, 300_000, 0.2)).toBe(false);
  });

  it('honours a configurable ratio', () => {
    expect(isWithinDetourLimit(330_000, 300_000, 0.1)).toBe(true);
    expect(isWithinDetourLimit(340_000, 300_000, 0.1)).toBe(false);
  });

  it('rejects zero, negative, and non-finite distances', () => {
    expect(isWithinDetourLimit(100, 0, 0.2)).toBe(false);
    expect(isWithinDetourLimit(0, 100, 0.2)).toBe(false);
    expect(isWithinDetourLimit(NaN, 100, 0.2)).toBe(false);
    expect(isWithinDetourLimit(100, NaN, 0.2)).toBe(false);
    expect(isWithinDetourLimit(-5, -10, 0.2)).toBe(false);
  });
});

describe('detourMetrics', () => {
  const plan = { pickupIdx: 1, dropoffIdx: 2 };

  it('computes detour distance and percentage (345 km -> 368 km = 23 km)', () => {
    const m = detourMetrics(345_000, 368_000, plan, 1200);
    expect(m.detourM).toBe(23_000);
    expect(m.detourPct).toBeCloseTo(23 / 345, 6);
    expect(m.pickupInsertIdx).toBe(1);
    expect(m.dropoffInsertIdx).toBe(2);
    expect(m.extraDurationS).toBe(1200);
    expect(m.materialNegative).toBe(false);
  });

  it('clamps minor negative rounding differences to zero silently', () => {
    const m = detourMetrics(300_000, 299_900, plan);
    expect(m.detourM).toBe(0);
    expect(m.detourPct).toBe(0);
    expect(m.materialNegative).toBe(false);
  });

  it('flags a materially shorter matched route for logging', () => {
    const m = detourMetrics(300_000, 295_000, plan);
    expect(m.detourM).toBe(0); // still clamped
    expect(m.materialNegative).toBe(true);
  });

  it('clamps negative extra duration to zero', () => {
    expect(detourMetrics(300_000, 310_000, plan, -30).extraDurationS).toBe(0);
    expect(detourMetrics(300_000, 310_000, plan, null).extraDurationS).toBeNull();
  });
});

describe('compareByDetour (ranking)', () => {
  const base = {
    detourM: 10_000,
    detourPct: 0.05,
    availableSeats: 2,
    createdAt: '2026-07-01T00:00:00Z',
  };

  it('ranks lowest detour distance first', () => {
    const a = { ...base, detourM: 5_000 };
    const b = { ...base, detourM: 9_000 };
    expect(compareByDetour(a, b)).toBeLessThan(0);
  });

  it('breaks detour ties by lowest detour percentage', () => {
    const a = { ...base, detourPct: 0.03 };
    const b = { ...base, detourPct: 0.08 };
    expect(compareByDetour(a, b)).toBeLessThan(0);
  });

  it('then prefers more available seats', () => {
    const a = { ...base, availableSeats: 4 };
    const b = { ...base, availableSeats: 1 };
    expect(compareByDetour(a, b)).toBeLessThan(0);
  });

  it('finally prefers the earlier-created ride', () => {
    const a = { ...base, createdAt: '2026-07-01T00:00:00Z' };
    const b = { ...base, createdAt: '2026-07-02T00:00:00Z' };
    expect(compareByDetour(a, b)).toBeLessThan(0);
  });

  it('sorts a full list by the documented precedence', () => {
    const c1 = { ...base, detourM: 8_000, detourPct: 0.1 };
    const c2 = { ...base, detourM: 8_000, detourPct: 0.02 };
    const c3 = { ...base, detourM: 2_000, detourPct: 0.5 };
    expect([c1, c2, c3].sort(compareByDetour)).toEqual([c3, c2, c1]);
  });
});

describe('rankingReason', () => {
  it('explains the winning candidate', () => {
    const reason = rankingReason(
      { detourM: 23_000, detourPct: 23 / 345, availableSeats: 3, createdAt: '2026-07-01' },
      0,
    );
    expect(reason).toContain('23.0 km');
    expect(reason).toContain('smallest detour');
  });
});
