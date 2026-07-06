import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

function httpContext(headers: Record<string, string> = {}) {
  const res = { statusCode: 200, setHeader: jest.fn() };
  const req = { method: 'GET', url: '/api/health', headers };
  return {
    ctx: {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as any,
    res,
  };
}

describe('LoggingInterceptor', () => {
  it('passes through non-http contexts untouched', (done) => {
    const interceptor = new LoggingInterceptor();
    const handle = of('ws-result');
    const ctx = { getType: () => 'ws' } as any;
    interceptor.intercept(ctx, { handle: () => handle } as any).subscribe((v) => {
      expect(v).toBe('ws-result');
      done();
    });
  });

  it('stamps a request id on the response and generates one when absent', (done) => {
    const interceptor = new LoggingInterceptor();
    const { ctx, res } = httpContext();
    interceptor
      .intercept(ctx, { handle: () => of('ok') } as any)
      .subscribe(() => {
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
        done();
      });
  });

  it('honours an inbound X-Request-Id', (done) => {
    const interceptor = new LoggingInterceptor();
    const { ctx, res } = httpContext({ 'x-request-id': 'abc-123' });
    interceptor
      .intercept(ctx, { handle: () => of('ok') } as any)
      .subscribe(() => {
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-123');
        done();
      });
  });
});
