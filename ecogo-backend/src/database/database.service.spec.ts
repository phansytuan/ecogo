import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';

describe('DatabaseService pool lifecycle', () => {
  it('handles idle-client pool errors instead of letting EventEmitter crash the process', () => {
    const pool = new EventEmitter() as EventEmitter & { end: jest.Mock };
    pool.end = jest.fn().mockResolvedValue(undefined);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new DatabaseService(pool as unknown as Pool);

    expect(() => pool.emit('error', new Error('database restarted'))).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      'PostgreSQL pool error: database restarted',
      expect.any(String),
    );
  });
});
