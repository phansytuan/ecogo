import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService.runCleanup', () => {
  it('expires empty past rides and cancels stale requests, returning counts', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'r1' }, { id: 'r2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'b1' }] }),
    };
    const db = {
      tx: jest.fn((fn) => fn(client)),
    } as any;
    const config = { get: (k: string) => (k === 'maintenance.rideGraceHours' ? 2 : 30) } as any;

    const svc = new MaintenanceService(db, config);
    const res = await svc.runCleanup();

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1][0]).toContain("status = 'cancelled'");
    expect(res).toEqual({ expiredRides: 2, cancelledRequests: 1 });
  });

  it('does not run a booking update when no rides expire', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const config = { get: jest.fn().mockReturnValue(1) } as any;

    await new MaintenanceService(db, config).runCleanup();

    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
