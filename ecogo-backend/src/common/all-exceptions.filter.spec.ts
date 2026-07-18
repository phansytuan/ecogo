jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

import { ArgumentsHost, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException } from '@nestjs/common';
import * as Sentry from '@sentry/node';

function httpHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/protected' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  it('uses the HTTP status label when Nest omits the error field', () => {
    const { host, response } = httpHost();

    new AllExceptionsFilter().catch(new UnauthorizedException(), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Unauthorized',
      path: '/api/protected',
    }));
  });

  it('preserves explicit Nest error labels and validation messages', () => {
    const { host, response } = httpHost();

    new AllExceptionsFilter().catch(new BadRequestException(['invalid phone']), host);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      error: 'Bad Request',
      message: ['invalid phone'],
    }));
  });
});

describe('AllExceptionsFilter Sentry reporting', () => {
  const makeHost = () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/x' }),
      }),
    };
    return { host, response };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures unexpected Errors', () => {
    const filter = new AllExceptionsFilter();
    const error = new Error('unexpected failure');
    const { host } = makeHost();

    filter.catch(error, host as any);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('does not capture expected HttpExceptions', () => {
    const filter = new AllExceptionsFilter();
    const error = new HttpException('Not found', 404);
    const { host } = makeHost();

    filter.catch(error, host as any);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
