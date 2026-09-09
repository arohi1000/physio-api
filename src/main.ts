import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import {
  EnvironmentVariables,
  parseAllowedOrigins,
} from './config/environment';
import { API_PREFIX, setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: parseAllowedOrigins(
      configService.get('CORS_ALLOWED_ORIGINS', { infer: true }),
    ),
    credentials: true,
  });
  app.enableShutdownHooks();

  setupSwagger(app);

  await app.listen(configService.get('PORT', { infer: true }));
}

void bootstrap();
