import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs one line per HTTP request — method, path, status, latency — and stamps a
 * request id (honouring an inbound X-Request-Id, else generating one) onto the
 * response so logs can be correlated across services. WebSocket traffic passes
 * through untouched.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const reqId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', reqId);

    const start = Date.now();
    const { method, originalUrl, url } = req;
    const path = originalUrl ?? url;

    return next.handle().pipe(
      tap({
        next: () => this.write(method, path, res.statusCode, start, reqId),
        error: (err) =>
          this.write(method, path, (err && err.status) || 500, start, reqId),
      }),
    );
  }

  private write(method: string, path: string, status: number, start: number, reqId: string) {
    const ms = Date.now() - start;
    const line = `${method} ${path} ${status} ${ms}ms [${reqId}]`;
    if (status >= 500) this.logger.error(line);
    else if (status >= 400) this.logger.warn(line);
    else this.logger.log(line);
  }
}
