import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReferralsService } from './referrals.service';

describe('ReferralsService', () => {
  const build = (one = jest.fn(), query = jest.fn()) => {
    const config = { get: jest.fn().mockReturnValue(14) };
    const events = { emit: jest.fn() };
    const service = new ReferralsService(
      { one, query } as any,
      config as any,
      events as any,
    );
    return { service, one, query, events };
  };

  it('rejects claims from non-drivers', async () => {
    const { service, one } = build();
    await expect(
      service.claim({ id: 'user-1', roles: ['passenger'] }, 'user-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(one).not.toHaveBeenCalled();
  });

  it('rejects self-referrals', async () => {
    const { service, one } = build();
    await expect(
      service.claim({ id: 'user-1', roles: ['driver'] }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(one).not.toHaveBeenCalled();
  });

  it('rejects an unknown referred user', async () => {
    const one = jest.fn().mockResolvedValue(null);
    const { service } = build(one);
    await expect(
      service.claim({ id: 'driver-1', roles: ['driver'] }, 'missing-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(one).toHaveBeenCalledTimes(1);
  });

  it('rejects users outside the claim window', async () => {
    const one = jest.fn().mockResolvedValue({
      id: 'user-1',
      created_at: new Date(
        Date.now() - 15 * 86_400_000,
      ).toISOString(),
      booking_count: 0,
    });
    const { service } = build(one);
    await expect(
      service.claim({ id: 'driver-1', roles: ['driver'] }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(one).toHaveBeenCalledTimes(1);
  });

  it('rejects users with booking history', async () => {
    const one = jest.fn().mockResolvedValue({
      id: 'user-1',
      created_at: new Date().toISOString(),
      booking_count: 1,
    });
    const { service } = build(one);
    await expect(
      service.claim({ id: 'driver-1', roles: ['driver'] }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(one).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate claims without writing an audit entry', async () => {
    const one = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        created_at: new Date().toISOString(),
        booking_count: 0,
      })
      .mockResolvedValueOnce(null);
    const { service, query } = build(one);

    await expect(
      service.claim({ id: 'driver-1', roles: ['driver'] }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates a pending claim, audits it, and emits an event', async () => {
    const one = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        created_at: new Date().toISOString(),
        booking_count: 0,
      })
      .mockResolvedValueOnce({
        id: 'referral-1',
        driver_id: 'driver-1',
        referred_user_id: 'user-1',
        pct: '0.05',
        status: 'pending_confirmation',
        expires_at: new Date().toISOString(),
      });
    const query = jest.fn().mockResolvedValue([]);
    const { service, events } = build(one, query);

    const result = await service.claim(
      { id: 'driver-1', roles: ['driver'] },
      'user-1',
    );

    expect(one.mock.calls[1][0]).toContain(
      "VALUES ($1, $2, 'pending_confirmation')",
    );
    expect(query.mock.calls[0][0]).toContain('INSERT INTO audit_log');
    expect(query.mock.calls[0][1][1]).toBe('referral.claimed');
    expect(events.emit).toHaveBeenCalledWith('referral.claimed', {
      referralId: 'referral-1',
      driverId: 'driver-1',
      referredUserId: 'user-1',
    });
    expect(result.status).toBe('pending_confirmation');
  });

  it('confirms a pending referral and audits consent', async () => {
    const one = jest.fn().mockResolvedValue({
      id: 'referral-1',
      driver_id: 'driver-1',
      status: 'confirmed',
    });
    const query = jest.fn().mockResolvedValue([]);
    const { service } = build(one, query);

    const result = await service.respond('user-1', true);

    expect(one.mock.calls[0][1]).toEqual(['user-1', 'confirmed']);
    expect(query.mock.calls[0][1][1]).toBe('referral.confirmed');
    expect(JSON.parse(query.mock.calls[0][1][3])).toEqual({
      referralId: 'referral-1',
      driverId: 'driver-1',
    });
    expect(result.status).toBe('confirmed');
  });

  it('rejects a response when no pending referral exists', async () => {
    const one = jest.fn().mockResolvedValue(null);
    const { service, query } = build(one);
    await expect(
      service.respond('user-1', false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
});
