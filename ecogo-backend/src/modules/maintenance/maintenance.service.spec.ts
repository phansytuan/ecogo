import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService.runCleanup', () => {
  it('expires empty past rides and cancels stale requests, returning counts', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]) // expired rides
        .mockResolvedValueOnce([{ id: 'b1' }]), // cancelled requests
    } as any;
    const config = { get: (k: string) => (k === 'maintenance.rideGraceHours' ? 2 : 30) } as any;

    const svc = new MaintenanceService(db, config);
    const res = await svc.runCleanup();

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ expiredRides: 2, cancelledRequests: 1 });
  });
});
