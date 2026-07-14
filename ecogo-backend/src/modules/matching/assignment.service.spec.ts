import { ConflictException } from '@nestjs/common';
import { AssignmentService } from './assignment.service';

describe('AssignmentService.tryAutoMatch', () => {
  it('tries the next ranked candidate when the first loses a race', async () => {
    const db = {
      one: jest.fn().mockResolvedValue({
        p_lat: 1, p_lng: 2, d_lat: 3, d_lng: 4, seats: 1,
        req_window_start: '2030-01-01T10:00:00Z',
        req_window_end: '2030-01-01T11:00:00Z',
        status: 'pending',
      }),
    } as any;
    const matching = {
      search: jest.fn().mockResolvedValue([{ rideId: 'r1' }, { rideId: 'r2' }]),
    } as any;
    const service = new AssignmentService(db, matching, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'assign')
      .mockRejectedValueOnce(new ConflictException('Ride is no longer open'))
      .mockResolvedValueOnce({ id: 'b1' } as any);

    await expect(service.tryAutoMatch('b1')).resolves.toBe(true);
    expect(service.assign).toHaveBeenNthCalledWith(2, 'b1', 'r2', 'auto');
  });

  it('does not hide unexpected assignment failures', async () => {
    const db = {
      one: jest.fn().mockResolvedValue({
        p_lat: 1, p_lng: 2, d_lat: 3, d_lng: 4, seats: 1,
        req_window_start: '2030-01-01T10:00:00Z',
        req_window_end: '2030-01-01T11:00:00Z',
        status: 'pending',
      }),
    } as any;
    const matching = { search: jest.fn().mockResolvedValue([{ rideId: 'r1' }]) } as any;
    const service = new AssignmentService(db, matching, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'assign').mockRejectedValue(new Error('database unavailable'));

    await expect(service.tryAutoMatch('b1')).rejects.toThrow('database unavailable');
  });
});
