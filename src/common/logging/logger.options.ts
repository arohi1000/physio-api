import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { LogLevel, NodeEnvironment } from '../../config/environment';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Redaction is configured before any PII flows through the API so that a later
 * milestone cannot introduce a leak simply by logging a new payload.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.token',
  'req.body.idToken',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.phone',
  'req.body.email',
  'password',
  'token',
  'idToken',
  'refreshToken',
  'accessToken',
  'authorization',
  'phone',
  'email',
  '*.password',
  '*.token',
  '*.idToken',
  '*.refreshToken',
  '*.accessToken',
  '*.authorization',
  '*.phone',
  '*.email',
];

function resolveRequestId(
  request: IncomingMessage,
  response: ServerResponse,
): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();

  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

export function buildLoggerOptions(
  nodeEnv: NodeEnvironment,
  logLevel: LogLevel,
): Params {
  const isProduction = nodeEnv === NodeEnvironment.Production;

  return {
    pinoHttp: {
      level: logLevel,
      genReqId: resolveRequestId,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
    },
  };
}
