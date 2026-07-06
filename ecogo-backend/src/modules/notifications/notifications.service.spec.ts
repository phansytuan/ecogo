import { NotificationsService } from './notifications.service';
import { InvalidTokenError } from './notification.provider';

describe('NotificationsService.pushToUser', () => {
  it('prunes device tokens that FCM reports as invalid', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: jest.fn((sql: string, params: any[]) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT token')) {
          return Promise.resolve([{ token: 't-good' }, { token: 't-bad' }]);
        }
        return Promise.resolve([]);
      }),
    } as any;
    const provider = {
      send: jest.fn(({ token }: { token: string }) =>
        token === 't-bad' ? Promise.reject(new InvalidTokenError('t-bad')) : Promise.resolve(),
      ),
    } as any;

    const svc = new NotificationsService(db, provider);
    await svc.pushToUser('user-1', 'Hi', 'Body');

    expect(provider.send).toHaveBeenCalledTimes(2);
    const del = calls.find((c) => c.sql.includes('DELETE FROM device_tokens'));
    expect(del).toBeDefined();
    expect(del!.params).toEqual(['t-bad']);
  });

  it('does not delete tokens on a successful send', async () => {
    const calls: string[] = [];
    const db = {
      query: jest.fn((sql: string) => {
        calls.push(sql);
        return sql.includes('SELECT token') ? Promise.resolve([{ token: 't1' }]) : Promise.resolve([]);
      }),
    } as any;
    const provider = { send: jest.fn(() => Promise.resolve()) } as any;

    const svc = new NotificationsService(db, provider);
    await svc.pushToUser('user-1', 'Hi', 'Body');

    expect(calls.some((s) => s.includes('DELETE'))).toBe(false);
  });
});
