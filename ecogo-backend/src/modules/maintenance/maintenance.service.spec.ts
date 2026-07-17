import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService.runCleanup', () => {
  const config = { get: jest.fn().mockReturnValue(1) } as any;

  const createService = (query: jest.Mock) => {
    const client = { query };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const realtime = { emitToDispatch: jest.fn() } as any;
    const events = { emit: jest.fn() } as any;
    const service = new MaintenanceService(
      db,
      config,
      realtime,
      events,
    );
    return { client, realtime, events, service };
  };

  it('flags overdue rides with active bookings without cancelling bookings', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'r1', driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const { client, realtime, events, service } = createService(query);

    const res = await service.runCleanup();

    expect(client.query).toHaveBeenCalledTimes(4);
    const sql = client.query.mock.calls.map((call) => call[0]).join('\n');
    expect(sql).not.toContain('ride_id = ANY');
    expect(realtime.emitToDispatch).toHaveBeenCalledWith(
      'ride.requires_review',
      { rideId: 'r1', driverId: 'd1' },
    );
    expect(events.emit).toHaveBeenCalledWith(
      'ride.requires_review',
      { rideId: 'r1', driverId: 'd1' },
    );
    expect(res).toEqual({
      expiredRides: 0,
      cancelledRequests: 0,
      ridesRequiringReview: 1,
    });
  });

  it('expires overdue rides without active bookings', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'r2' }, { id: 'r3' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const { service } = createService(query);

    const res = await service.runCleanup();

    expect(res).toEqual({
      expiredRides: 2,
      cancelledRequests: 0,
      ridesRequiringReview: 0,
    });
  });

  it('reminds dispatch about unresolved review rides', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'r4', driver_id: 'd4' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { realtime, events, service } = createService(query);

    const res = await service.runCleanup();

    expect(realtime.emitToDispatch).toHaveBeenCalledWith(
      'ride.requires_review.reminder',
      { rideId: 'r4', driverId: 'd4' },
    );
    expect(events.emit).toHaveBeenCalledWith(
      'ride.requires_review.reminder',
      { rideId: 'r4', driverId: 'd4' },
    );
    expect(res).toEqual({
      expiredRides: 0,
      cancelledRequests: 0,
      ridesRequiringReview: 0,
    });
  });

  it('continues cancelling stale ride requests and returns all counts', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'r5' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b1' }, { id: 'b2' }] });
    const { service } = createService(query);

    const res = await service.runCleanup();

    expect(res).toEqual({
      expiredRides: 1,
      cancelledRequests: 2,
      ridesRequiringReview: 0,
    });
  });
});
