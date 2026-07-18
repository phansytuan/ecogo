import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import * as Sentry from '@sentry/node';

/**
 * Consistent error envelope for HTTP. Unknown (non-Http) errors are logged with
 * their stack but returned as a generic 500 so internals never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      if (exception instanceof Error) this.logger.error(exception.message, exception.stack);
      return;
    }
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = 500;
    let message: unknown = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = STATUS_CODES[status] ?? 'HTTP Error';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as Record<string, unknown>;
        message = b.message ?? body;
        if (typeof b.error === 'string') error = b.error;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      Sentry.captureException(exception);
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
