import { NotFoundException } from '@nestjs/common';
import { InvalidTokenError } from './notification.provider';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const setup = (
    tokens: string[],
    send: jest.Mock = jest.fn().mockResolvedValue(undefined),
  ) => {
    const calls: string[] = [];
    const one = jest.fn(async (sql: string) => {
      calls.push(sql);
      if (/INSERT INTO notifications/.test(sql)) return { id: 'n-1' };
      return null;
    });
    const query = jest.fn(async (sql: string) => {
      calls.push(sql);
      if (/SELECT token FROM device_tokens/.test(sql)) {
        return tokens.map((token) => ({ token }));
      }
      return [];
    });
    const provider = {
      send: jest.fn(async (message: { token: string }) => {
        calls.push(`send:${message.token}`);
        return send(message);
      }),
    };
    const service = new NotificationsService(
      { one, query } as any,
      provider as any,
    );
    return { service, one, query, provider, calls };
  };

  it('writes an outbox row before delivery and marks it sent', async () => {
    const { service, query, provider, calls } = setup(['t1']);

    await service.pushToUser('user-1', 'Title', 'Body', { rideId: 'r1' });

    expect(calls.findIndex((call) => /INSERT INTO notifications/.test(call)))
      .toBeLessThan(calls.findIndex((call) => call === 'send:t1'));
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => /status = 'sent'/.test(sql)))
      .toBe(true);
  });

  it('marks the outbox row skipped when the user has no tokens', async () => {
    const { service, query, provider } = setup([]);

    await service.pushToUser('user-1', 'Title', 'Body');

    expect(provider.send).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => /status = 'skipped'/.test(sql)))
      .toBe(true);
  });

  it('marks the row failed when every delivery errors', async () => {
    const send = jest.fn().mockRejectedValue(new Error('FCM unavailable'));
    const { service, query } = setup(['t1'], send);

    await service.pushToUser('user-1', 'Title', 'Body');

    expect(query.mock.calls.some(([sql]) => /status = 'failed'/.test(sql)))
      .toBe(true);
  });

  it('prunes invalid tokens but counts successful deliveries', async () => {
    const send = jest.fn(async ({ token }: { token: string }) => {
      if (token === 't-bad') throw new InvalidTokenError('t-bad');
    });
    const { service, query } = setup(['t-good', 't-bad'], send);

    await service.pushToUser('user-1', 'Title', 'Body');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM device_tokens'),
      ['t-bad'],
    );
    expect(query.mock.calls.some(([sql]) => /status = 'sent'/.test(sql)))
      .toBe(true);
  });

  it('retryUndelivered redelivers rows and returns their count', async () => {
    const query = jest.fn(async (sql: string) => {
      if (/SELECT id, user_id, title, body, data/.test(sql)) {
        return [
          { id: 'n-1', user_id: 'u1', title: 'A', body: 'B', data: null },
          { id: 'n-2', user_id: 'u2', title: 'C', body: 'D', data: null },
        ];
      }
      if (/SELECT token FROM device_tokens/.test(sql)) {
        return [{ token: 't1' }];
      }
      return [];
    });
    const provider = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(
      { query, one: jest.fn() } as any,
      provider as any,
    );

    await expect(service.retryUndelivered()).resolves.toBe(2);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(
      query.mock.calls.filter(([sql]) => /status = 'sent'/.test(sql)),
    ).toHaveLength(2);
  });

  it('markRead rejects rows that do not belong to the user', async () => {
    const one = jest.fn().mockResolvedValue(null);
    const service = new NotificationsService(
      { one, query: jest.fn() } as any,
      { send: jest.fn() } as any,
    );

    await expect(
      service.markRead('user-1', 'notification-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markRead returns the updated owner row', async () => {
    const row = { id: 'notification-1', read_at: new Date() };
    const one = jest.fn().mockResolvedValue(row);
    const service = new NotificationsService(
      { one, query: jest.fn() } as any,
      { send: jest.fn() } as any,
    );

    await expect(
      service.markRead('user-1', 'notification-1'),
    ).resolves.toBe(row);
    expect(one).toHaveBeenCalledWith(
      expect.stringContaining('AND user_id = $1'),
      ['user-1', 'notification-1'],
    );
  });
});
