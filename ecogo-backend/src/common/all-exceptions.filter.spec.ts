import { ArgumentsHost, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

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
