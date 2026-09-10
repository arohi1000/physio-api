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

  /**
   * Signs reschedule links (`GET /appointments/reschedule/:token`). Kept
   * separate from JWT_ACCESS_SECRET: these tokens are handed to unauthenticated
   * patients over WhatsApp/SMS, a materially different exposure than a CRM
   * bearer token, so the two must not share a signing key.
   */
  @IsString()
  @MinLength(32)
  readonly RESCHEDULE_TOKEN_SECRET: string;

  /** Reschedule-link lifetime (seconds). Default 14 days. */
  @IsInt()
  @Min(60)
  readonly RESCHEDULE_TOKEN_TTL_SECONDS: number = 1_209_600;

  /**
   * Directory the local-disk `FileStorageProvider` writes PDFs under
   * (M3-CONTRACT.md §2.2). Relative paths resolve against the process cwd.
   * Gitignored — never committed, and a fresh clone/CI creates it on first use.
   */
  @IsString()
  @IsNotEmpty()
  readonly FILE_STORAGE_DIR: string = './storage/files';

  /**
   * Signs the download URLs `LocalDiskFileStorageProvider.getSignedUrl` issues,
   * so a URL cannot be forged or have its expiry extended. Separate from every
   * other signing key for the same reason RESCHEDULE_TOKEN_SECRET is separate:
   * a different exposure (these links are followed directly by a browser, no
   * bearer token attached).
   */
  @IsString()
  @MinLength(32)
  readonly FILE_STORAGE_SIGNING_SECRET: string;

  /**
   * Base URL used to build the absolute signed URLs `GET .../pdf` returns.
   * Must be the URL a client can actually reach this API on.
   */
  @IsString()
  @IsNotEmpty()
  readonly PUBLIC_API_BASE_URL: string = 'http://localhost:4000';
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
