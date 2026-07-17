import { ConflictException, NotFoundException } from '@nestjs/common';
import { DispatchReviewService } from './review.service';

describe('DispatchReviewService', () => {
  const setup = (
    rideRows: { id: string; driver_id: string; status: string }[],
    bookingRows = [{ id: 'booking-1', passenger_id: 'passenger-1' }],
  ) => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: rideRows })
        .mockResolvedValueOnce({ rows: bookingRows })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const realtime = { emitToRide: jest.fn(), emitToDispatch: jest.fn() } as any;
    const events = { emit: jest.fn() } as any;
    const service = new DispatchReviewService(db, realtime, events);
    return { client, realtime, events, service };
  };

  it('resolves a reviewed ride as completed and audits the action', async () => {
    const { client, realtime, events, service } = setup([
      { id: 'ride-1', driver_id: 'driver-1', status: 'requires_review' },
    ]);

    const payload = await service.resolve(
      'ride-1',
      'dispatcher-1',
      'completed',
      'Driver confirmed the trip occurred',
    );

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[2][0]).toContain('completed_at = now()');
    const auditCall = client.query.mock.calls[3];
    expect(auditCall[0]).toContain('INSERT INTO audit_log');
    expect(auditCall[1][0]).toBe('dispatcher-1');
    expect(auditCall[1][1]).toBe('ride.review.resolved');
    expect(JSON.parse(auditCall[1][3])).toEqual({
      outcome: 'completed',
      reason: 'Driver confirmed the trip occurred',
      bookingIds: ['booking-1'],
    });
    expect(events.emit).toHaveBeenCalledWith('ride.completed', payload);
    expect(realtime.emitToDispatch).toHaveBeenCalledWith(
      'ride.review.resolved',
      { rideId: 'ride-1', outcome: 'completed' },
    );
    expect(payload).toEqual({
      rideId: 'ride-1',
      driverId: 'driver-1',
      status: 'completed',
      bookings: [{ id: 'booking-1', passengerId: 'passenger-1' }],
    });
  });

  it('resolves a reviewed ride as cancelled', async () => {
    const { client, events, service } = setup([
      { id: 'ride-2', driver_id: 'driver-2', status: 'requires_review' },
    ]);
    await service.resolve('ride-2', 'dispatcher-1', 'cancelled', 'Trip did not occur');
    expect(client.query.mock.calls[2][0]).toContain('available_seats = 0');
    expect(events.emit).toHaveBeenCalledWith(
      'ride.cancelled',
      expect.objectContaining({ rideId: 'ride-2', status: 'cancelled' }),
    );
  });

  it('throws when the ride does not exist', async () => {
    const { client, service } = setup([]);
    await expect(
      service.resolve('ride-3', 'dispatcher-1', 'completed', 'Valid reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('throws when the ride is not awaiting review', async () => {
    const { client, service } = setup([
      { id: 'ride-4', driver_id: 'driver-4', status: 'open' },
    ]);
    await expect(
      service.resolve('ride-4', 'dispatcher-1', 'completed', 'Valid reason'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('stores the resolution reason in the audit details', async () => {
    const { client, service } = setup([
      { id: 'ride-5', driver_id: 'driver-5', status: 'requires_review' },
    ]);
    const reason = 'Passenger and driver confirmed completion';
    await service.resolve('ride-5', 'dispatcher-2', 'completed', reason);
    const auditCall = client.query.mock.calls[3];
    expect(JSON.parse(auditCall[1][3]).reason).toBe(reason);
  });
});
