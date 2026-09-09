import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MinLength,
  Min,
  validateSync,
} from 'class-validator';
import { assertDevBypassIsNotProduction } from './dev-bypass';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum LogLevel {
  Fatal = 'fatal',
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  readonly NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  readonly PORT: number = 4000;

  @IsString()
  @IsNotEmpty()
  readonly DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  readonly REDIS_URL: string;

  @IsString()
  readonly CORS_ALLOWED_ORIGINS: string = '';

  @IsEnum(LogLevel)
  readonly LOG_LEVEL: LogLevel = LogLevel.Info;

  /** Signing key for CRM access tokens. Rotating it invalidates every session. */
  @IsString()
  @MinLength(32)
  readonly JWT_ACCESS_SECRET: string;

  @IsInt()
  @Min(60)
  readonly JWT_ACCESS_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(300)
  readonly JWT_REFRESH_TTL_SECONDS: number = 2_592_000;

  /**
   * OAuth client ID the CRM obtains its Google ID tokens with; also the `aud`
   * claim every incoming ID token is verified against. Empty until a Google
   * Cloud OAuth client exists, in which case `/auth/google` rejects everything.
   */
  @IsString()
  readonly GOOGLE_OAUTH_CLIENT_ID: string = '';

  /** See src/config/dev-bypass.ts. Never true outside local development. */
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  readonly AUTH_DEV_BYPASS: boolean = false;
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  assertDevBypassIsNotProduction(raw as NodeJS.ProcessEnv);

  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed;
}

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
