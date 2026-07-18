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
    const configStub = {
      get: (key: string) =>
        key === 'directions.dailyCallBudget' ? 0 : 'test-key',
    };
    service = new GoongDirectionsService(
      configStub as any,
      { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1) } as any,
      { emit: jest.fn() } as any,
    );
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

describe('Goong budget guard', () => {
  const origin = { lat: 10.77, lng: 106.69 };
  const dest = { lat: 10.78, lng: 106.7 };
  let getMock: jest.Mock;
  let redisMock: { incr: jest.Mock; expire: jest.Mock };
  let eventsMock: { emit: jest.Mock };

  const buildService = (budget: number) => {
    const config = {
      get: (key: string) =>
        key === 'directions.dailyCallBudget' ? budget : 'test-key',
    };
    const service = new GoongDirectionsService(
      config as any,
      redisMock as any,
      eventsMock as any,
    );
    (service as any).sleep = jest.fn().mockResolvedValue(undefined);
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getMock = axios.get as unknown as jest.Mock;
    getMock.mockResolvedValue(successfulResponse);
    redisMock = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    eventsMock = { emit: jest.fn() };
  });

  it('warns once when usage reaches 80 percent', async () => {
    redisMock.incr.mockResolvedValue(8);
    const service = buildService(10);
    const warn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(service.route(origin, dest)).resolves.toBeDefined();

    expect(warn).toHaveBeenCalledWith(
      'Goong daily calls at 80% of budget (8/10)',
    );
    expect(eventsMock.emit).not.toHaveBeenCalled();
  });

  it('logs and alerts dispatch after the budget is exceeded', async () => {
    redisMock.incr.mockResolvedValue(11);
    const service = buildService(10);
    const error = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(service.route(origin, dest)).resolves.toBeDefined();

    expect(error).toHaveBeenCalledWith(
      'Goong daily call budget exceeded (10/10)',
    );
    expect(eventsMock.emit).toHaveBeenCalledWith('goong.budget.exceeded', {
      day: expect.any(String),
      count: 10,
      budget: 10,
    });
  });

  it('does not break routing when Redis tracking fails', async () => {
    redisMock.incr.mockRejectedValue(new Error('Redis unavailable'));
    const service = buildService(10);
    jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(service.route(origin, dest)).resolves.toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch Redis when the budget guard is disabled', async () => {
    const service = buildService(0);

    await expect(service.route(origin, dest)).resolves.toBeDefined();

    expect(redisMock.incr).not.toHaveBeenCalled();
  });
});
