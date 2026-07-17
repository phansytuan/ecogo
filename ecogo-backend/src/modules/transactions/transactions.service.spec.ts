import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  const realtime = { emitToDispatch: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records the snapshotted fare as gross with fee and net', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'booking-1',
            passenger_id: 'passenger-1',
            fare: '100000',
            status: 'completed',
            driver_id: 'driver-1',
            ride_status: 'completed',
          }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: 'transaction-1' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const service = new TransactionsService(db, realtime as any);

    await service.complete('driver-1', 'booking-1');

    expect(client.query.mock.calls[2][1]).toEqual([
      'booking-1',
      100000,
      10000,
      90000,
    ]);
  });

  it('rejects completion when payment already exists', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'booking-1',
            passenger_id: 'passenger-1',
            fare: '100000',
            status: 'completed',
            driver_id: 'driver-1',
            ride_status: 'completed',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const service = new TransactionsService(db, realtime as any);

    await expect(
      service.complete('driver-1', 'booking-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('adjusts gross, pending affiliate earnings, and audit details', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', gross: '100000' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', gross: 120000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'earning-1' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const service = new TransactionsService(db, realtime as any);

    const result = await service.adjustGross(
      'dispatcher-1',
      'booking-1',
      120000,
      'Dropoff changed',
    );

    expect(client.query.mock.calls[1][1]).toEqual([
      'booking-1',
      120000,
      12000,
      108000,
    ]);
    expect(client.query.mock.calls[2][0]).toContain(
      "payout_status = 'pending'",
    );
    const auditDetails = JSON.parse(client.query.mock.calls[3][1][3]);
    expect(auditDetails).toEqual({
      oldGross: 100000,
      newGross: 120000,
      reason: 'Dropoff changed',
      affiliateAdjusted: true,
    });
    expect(result.affiliateAdjusted).toBe(true);
  });

  it('reports false when no pending affiliate row is adjusted', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', gross: '100000' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', gross: 90000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const service = new TransactionsService(db, realtime as any);
    const result = await service.adjustGross(
      'dispatcher-1',
      'booking-1',
      90000,
      'Negotiated fare',
    );
    expect(result.affiliateAdjusted).toBe(false);
  });

  it('rejects adjustment when no transaction exists', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const service = new TransactionsService(db, realtime as any);
    await expect(
      service.adjustGross('dispatcher-1', 'booking-1', 90000, 'Valid reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an adjustment request from another driver', async () => {
    const db = {
      one: jest.fn().mockResolvedValue({ id: 'booking-1', driver_id: 'driver-2' }),
      query: jest.fn(),
    } as any;
    const service = new TransactionsService(db, realtime as any);
    await expect(
      service.requestAdjustment('driver-1', 'booking-1', 110000, 'Changed route'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
    expect(realtime.emitToDispatch).not.toHaveBeenCalled();
  });

  it('records and emits a driver adjustment request', async () => {
    const db = {
      one: jest.fn().mockResolvedValue({
        id: 'booking-1',
        driver_id: 'driver-1',
        current_gross: '100000',
        fare: '90000',
      }),
      query: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new TransactionsService(db, realtime as any);
    const reason = 'Passenger changed dropoff';
    await service.requestAdjustment('driver-1', 'booking-1', 115000, reason);
    const details = JSON.parse(db.query.mock.calls[0][1][3]);
    expect(details).toEqual({
      proposedGross: 115000,
      reason,
      currentGross: 100000,
    });
    expect(realtime.emitToDispatch).toHaveBeenCalledWith(
      'transaction.adjustment.requested',
      {
        bookingId: 'booking-1',
        driverId: 'driver-1',
        proposedGross: 115000,
        reason,
      },
    );
  });
});
