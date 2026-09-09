import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

interface ErrorResponseBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string | string[];
  readonly path: string;
  readonly timestamp: string;
  readonly requestId?: string;
}

const GENERIC_MESSAGE = 'Internal server error';
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.buildBody(exception, statusCode, request);

    if (statusCode >= SERVER_ERROR_THRESHOLD) {
      this.logger.error({ err: exception, statusCode }, 'Unhandled exception');
    } else {
      this.logger.warn({ err: exception, statusCode }, 'Request failed');
    }

    response.status(statusCode).json(body);
  }

  /**
   * Stack traces and driver-level error text are never placed in the response
   * body — the full error is only ever written to the structured log.
   */
  private buildBody(
    exception: unknown,
    statusCode: number,
    request: Request,
  ): ErrorResponseBody {
    const base = {
      statusCode,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: typeof request.id === 'string' ? request.id : undefined,
    };

    if (!(exception instanceof HttpException)) {
      return {
        ...base,
        error: 'Internal Server Error',
        message: GENERIC_MESSAGE,
      };
    }

    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return { ...base, error: exception.name, message: payload };
    }

    const { message, error } = payload as {
      message?: string | string[];
      error?: string;
    };

    return {
      ...base,
      error: error ?? exception.name,
      message: message ?? exception.message,
    };
  }
}
