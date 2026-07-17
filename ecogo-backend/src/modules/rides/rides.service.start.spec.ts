import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RidesService } from './rides.service';

describe('RidesService.start', () => {
  const setup = (
    rideRows: Record<string, unknown>[],
    bookingRows = [{ id: 'booking-1', passenger_id: 'passenger-1' }],
  ) => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: rideRows })
        .mockResolvedValueOnce({ rows: bookingRows })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const realtime = { emitToRide: jest.fn(), emitToDispatch: jest.fn() };
    const events = { emit: jest.fn() };
    const config = { get: jest.fn() };
    const service = new RidesService(
      db,
      {} as any,
      realtime as any,
      events as any,
      config as any,
      {} as any,
    );
    return { client, realtime, events, service };
  };

  it('starts an open ride and broadcasts the mapped payload', async () => {
    const departureTime = new Date().toISOString();
    const { client, realtime, events, service } = setup(
      [
        {
          id: 'ride-1',
          driver_id: 'driver-1',
          status: 'open',
          departure_time: departureTime,
        },
      ],
    );

    const result = await service.start('ride-1', 'driver-1');

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[2][0]).toContain(
      "UPDATE rides SET status = 'ongoing'",
    );
    expect(result).toEqual({
      rideId: 'ride-1',
      driverId: 'driver-1',
      status: 'ongoing',
      bookings: [{ id: 'booking-1', passengerId: 'passenger-1' }],
    });
    expect(realtime.emitToRide).toHaveBeenCalledWith(
      'ride-1',
      'ride.started',
      result,
    );
    expect(realtime.emitToDispatch).toHaveBeenCalledWith(
      'ride.started',
      result,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'ride.started',
      result,
    );
  });

  it('rejects a ride that is already ongoing', async () => {
    const { service } = setup([
      { id: 'ride-1', driver_id: 'driver-1', status: 'ongoing' },
    ]);
    await expect(
      service.start('ride-1', 'driver-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects starting more than 30 minutes early', async () => {
    const departureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { service } = setup(
      [
        { id: 'ride-1', driver_id: 'driver-1', status: 'open', departure_time: departureTime },
      ],
    );
    await expect(
      service.start('ride-1', 'driver-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a driver who does not own the ride', async () => {
    const { service } = setup([
      { id: 'ride-1', driver_id: 'driver-2', status: 'open' },
    ]);
    await expect(
      service.start('ride-1', 'driver-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing ride after only the lock query', async () => {
    const { client, service } = setup([]);
    await expect(
      service.start('ride-1', 'driver-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
