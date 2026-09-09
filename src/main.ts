import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { isDevBypassEnabled } from './config/dev-bypass';
import {
  EnvironmentVariables,
  parseAllowedOrigins,
} from './config/environment';
import { API_PREFIX, setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();

  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.enableCors({
    origin: parseAllowedOrigins(
      configService.get('CORS_ALLOWED_ORIGINS', { infer: true }),
    ),
    credentials: true,
  });
  app.enableShutdownHooks();

  setupSwagger(app);

  if (isDevBypassEnabled()) {
    logger.warn(
      'AUTH_DEV_BYPASS is enabled: POST /api/v1/auth/dev-login issues real sessions ' +
        'without verifying identity. Local development only — never deploy with this set.',
    );
  }

  await app.listen(configService.get('PORT', { infer: true }));
}

void bootstrap();
