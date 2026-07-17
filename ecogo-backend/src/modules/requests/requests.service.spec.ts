import { RequestsService } from './requests.service';

describe('RequestsService', () => {
  it('persists a pending request, enqueues first-match, and returns without matching inline', async () => {
    const response = {
      id: 'booking-1',
      ride_id: null,
      status: 'pending',
      seats: 1,
      fare: null,
      matched_by: null,
      created_at: '2026-07-17T00:00:00.000Z',
    };
    const db = { one: jest.fn().mockResolvedValue(response) };
    const queue = { scheduleFirstMatch: jest.fn().mockResolvedValue(undefined) };
    const service = new RequestsService(db as any, queue as any);

    const result = await service.create('passenger-1', {
      pickup: { lat: 18.679, lng: 105.681 },
      dropoff: { lat: 21.0278, lng: 105.8342 },
      windowStart: '2026-07-18T01:00:00.000Z',
      windowEnd: '2026-07-18T02:00:00.000Z',
      seats: 1,
    });

    expect(queue.scheduleFirstMatch).toHaveBeenCalledWith('booking-1');
    expect(db.one).toHaveBeenCalledTimes(1);
    expect(result).toEqual(response);
  });
});
