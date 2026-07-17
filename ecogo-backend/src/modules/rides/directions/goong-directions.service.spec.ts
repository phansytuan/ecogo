import axios from 'axios';
import { GoongDirectionsService } from './goong-directions.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: (error: any) => error?.isAxiosError === true,
  },
}));

const successfulResponse = {
  data: {
    routes: [
      {
        overview_polyline: { points: '_p~iF~ps|U' },
        legs: [{ duration: { value: 60 } }],
      },
    ],
  },
};

const axiosError = (status?: number) => ({
  isAxiosError: true,
  response: status === undefined ? undefined : { status },
});

describe('GoongDirectionsService', () => {
  let service: GoongDirectionsService;
  let getMock: jest.Mock;
  let sleepMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getMock = axios.get as unknown as jest.Mock;
    service = new GoongDirectionsService({ get: () => 'test-key' } as any);
    sleepMock = jest.fn().mockResolvedValue(undefined);
    (service as any).sleep = sleepMock;
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  });

  it('retries two 503 responses and then succeeds', async () => {
    getMock
      .mockRejectedValueOnce(axiosError(503))
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValueOnce(successfulResponse);

    await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).resolves.toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 300);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 900);
  });

  it('retries a network error and can succeed', async () => {
    getMock.mockRejectedValueOnce(axiosError()).mockResolvedValueOnce(successfulResponse);

    await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).resolves.toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(300);
  });

  it('does not retry a 400 response', async () => {
    const error = axiosError(400);
    getMock.mockRejectedValue(error);
    await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).rejects.toBe(error);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('rejects after three 5xx responses', async () => {
    const error = axiosError(503);
    getMock.mockRejectedValue(error);
    await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).rejects.toBe(error);
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after ten consecutive final failures', async () => {
    const error = axiosError(400);
    getMock.mockRejectedValue(error);

    for (let failure = 0; failure < 10; failure += 1) {
      await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).rejects.toBe(error);
    }

    expect(getMock).toHaveBeenCalledTimes(10);
    await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).rejects.toThrow(
      'Goong circuit open — routing temporarily unavailable',
    );
    expect(getMock).toHaveBeenCalledTimes(10);
  });

  it('allows requests after the circuit-open period passes', async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const error = axiosError(400);
    getMock.mockRejectedValue(error);

    try {
      for (let failure = 0; failure < 10; failure += 1) {
        await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).rejects.toBe(error);
      }
      expect(getMock).toHaveBeenCalledTimes(10);
      now += 30_001;
      getMock.mockResolvedValue(successfulResponse);
      await expect(service.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).resolves.toMatchObject({
        durationS: 60,
      });
      expect(getMock).toHaveBeenCalledTimes(11);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
