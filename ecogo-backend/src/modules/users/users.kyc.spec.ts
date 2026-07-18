import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.setKycStatus', () => {
  it('updates KYC status and writes an audit entry', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', kyc_status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const db = { tx: jest.fn((fn) => fn(client)) } as any;
    const service = new UsersService(db);

    const result = await service.setKycStatus(
      'admin-1',
      'user-1',
      'verified',
      'Documents checked manually',
    );

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1][0]).toContain('UPDATE users');
    const auditCall = client.query.mock.calls[2];
    expect(auditCall[0]).toContain('INSERT INTO audit_log');
    expect(auditCall[1][0]).toBe('admin-1');
    const details = JSON.parse(auditCall[1][2]);
    expect(details).toEqual({
      oldStatus: 'pending',
      newStatus: 'verified',
      reason: 'Documents checked manually',
    });
    expect(result).toEqual({
      id: 'user-1',
      kycStatus: 'verified',
      changed: true,
    });
  });

  it('short-circuits when the status is unchanged', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', kyc_status: 'verified' }] }),
    };
    const service = new UsersService({ tx: (fn: any) => fn(client) } as any);

    const result = await service.setKycStatus('admin-1', 'user-1', 'verified');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'user-1', kycStatus: 'verified', changed: false });
  });

  it('throws when the user does not exist', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new UsersService({ tx: (fn: any) => fn(client) } as any);
    await expect(
      service.setKycStatus('admin-1', 'missing-user', 'verified'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
