import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { RidesService } from './rides.service';

describe('RidesService.create KYC gate', () => {
  const dto = {
    vehicleId: 'vehicle-1',
    departureTime: '2000-01-01T00:00:00.000Z',
  } as any;

  const makeService = (
    requireKyc: boolean,
    kycStatus: string | null,
  ) => {
    const db = {
      one: jest.fn().mockResolvedValue(
        kycStatus == null ? null : { kyc_status: kycStatus },
      ),
    };
    const vehicles = {
      findOwned: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
    };
    const realtime = {
      emitToRide: jest.fn(),
      emitToDispatch: jest.fn(),
    };
    const events = { emit: jest.fn() };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'rides.requireDriverKyc') return requireKyc;
        if (key === 'rides.maxBackdateMin') return 60;
        if (key === 'rides.maxAheadDays') return 30;
        return undefined;
      }),
    };
    const service = new RidesService(
      db as any,
      vehicles as any,
      realtime as any,
      events as any,
      config as any,
      {} as any,
    );
    return { db, vehicles, service };
  };

  it('rejects an unverified driver after checking vehicle ownership', async () => {
    const { db, vehicles, service } = makeService(true, 'pending');

    await expect(
      service.create('driver-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(vehicles.findOwned).toHaveBeenCalledWith(
      'vehicle-1',
      'driver-1',
    );
    expect(db.one).toHaveBeenCalledWith(
      expect.stringContaining('SELECT kyc_status FROM users'),
      ['driver-1'],
    );
  });

  it('allows a verified driver to proceed to departure validation', async () => {
    const { service } = makeService(true, 'verified');

    await expect(
      service.create('driver-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not query KYC when the gate is disabled', async () => {
    const { db, service } = makeService(false, null);

    await expect(
      service.create('driver-1', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.one).not.toHaveBeenCalled();
  });
});
