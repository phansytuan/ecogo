import { ConflictException } from '@nestjs/common';
import { assertPassengerAvailable } from './passenger-availability';

describe('assertPassengerAvailable', () => {
  const args = ['p1', 'r1', '2030-01-01T10:00:00Z', 3600, 0.2, 0.8] as const;

  it('takes a passenger-scoped transaction lock and accepts a free window', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 }),
    } as any;

    await assertPassengerAvailable(client, ...args);

    expect(client.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
  });

  it('rejects a second active booking on the same ride', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;

    await expect(assertPassengerAvailable(client, ...args)).rejects.toThrow(
      'already have an active booking',
    );
  });

  it('rejects an active trip whose passenger segment overlaps', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;

    await expect(assertPassengerAvailable(client, ...args)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
