import {
  effectiveCapacity,
  recomputeRideAvailability,
} from './availability';

describe('ride availability', () => {
  const makeClient = (
    totalSeats: number | null,
    locked: number,
    bookings: Array<{ fp: number; fd: number; seats: number }> = [],
  ) => {
    const query = jest.fn(async (sql: string) => {
      if (/SELECT total_seats FROM rides/.test(sql)) {
        return { rows: totalSeats == null ? [] : [{ total_seats: totalSeats }] };
      }
      if (/AS locked/.test(sql)) {
        return { rows: [{ locked }] };
      }
      if (/SELECT fp, fd, seats FROM bookings/.test(sql)) {
        return { rows: bookings };
      }
      if (/UPDATE rides/.test(sql)) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    return { query };
  };

  it('computes tightest segment availability after locked seats', async () => {
    const client = makeClient(4, 1, [{ fp: 0, fd: 2, seats: 2 }]);
    const free = await recomputeRideAvailability(client as any, 'ride-1');
    expect(free).toBe(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE rides'),
      ['ride-1', 1],
    );
  });

  it('updates an open ride with zero free seats', async () => {
    const client = makeClient(2, 2);
    const free = await recomputeRideAvailability(client as any, 'ride-1');
    expect(free).toBe(0);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE rides'),
      ['ride-1', 0],
    );
  });

  it('returns zero without updating when the ride is missing', async () => {
    const client = makeClient(null, 0);
    await expect(
      recomputeRideAvailability(client as any, 'ride-1'),
    ).resolves.toBe(0);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) => /UPDATE rides/.test(sql))).toBe(false);
  });

  it('clamps effective capacity at zero', () => {
    expect(effectiveCapacity(2, 3)).toBe(0);
  });
});
