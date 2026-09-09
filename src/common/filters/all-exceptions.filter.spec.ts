import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

function createHost(captured: CapturedResponse): ArgumentsHost {
  const response = {
    status(statusCode: number) {
      captured.statusCode = statusCode;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/v1/health', id: 'req-1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let captured: CapturedResponse;

  beforeEach(() => {
    captured = { statusCode: 0, body: {} };
    filter = new AllExceptionsFilter({
      error: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger);
  });

  it('preserves the status and validation messages of an HttpException', () => {
    filter.catch(
      new BadRequestException(['phone must be a string']),
      createHost(captured),
    );

    expect(captured.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.message).toEqual(['phone must be a string']);
    expect(captured.body.requestId).toBe('req-1');
  });

  it('maps an unknown error to a generic 500 with no stack trace', () => {
    const error = new Error('Postgres pool exhausted at line 42');

    filter.catch(error, createHost(captured));

    expect(captured.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.message).toBe('Internal server error');
    expect(JSON.stringify(captured.body)).not.toContain('Postgres pool');
    expect(captured.body).not.toHaveProperty('stack');
  });
});
