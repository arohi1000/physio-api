// Must run before the @Module decorator below: AuthModule.register() reads
// AUTH_DEV_BYPASS from process.env while this file is being evaluated.
import './config/load-env';

import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { buildLoggerOptions } from './common/logging/logger.options';
import {
  EnvironmentVariables,
  validateEnvironment,
} from './config/environment';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BlogModule } from './modules/blog/blog.module';
import { ClinicSettingsModule } from './modules/clinic-settings/clinic-settings.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { FilesModule } from './modules/files/files.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { HealthModule } from './modules/health/health.module';
import { PatientsModule } from './modules/patients/patients.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ServicesModule } from './modules/services/services.module';
import { SiteContentModule } from './modules/site-content/site-content.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables, true>) =>
        buildLoggerOptions(
          configService.get('NODE_ENV', { infer: true }),
          configService.get('LOG_LEVEL', { infer: true }),
        ),
    }),
    // Baseline per-IP limit; the auth routes tighten it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,
    AuthModule.register(),
    AuditModule,
    ClinicSettingsModule,
    ServicesModule,
    PatientsModule,
    CouponsModule,
    AvailabilityModule,
    AppointmentsModule,
    FilesModule,
    FollowUpsModule,
    PrescriptionsModule,
    ReceiptsModule,
    BlogModule,
    SiteContentModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Order matters: rate limit, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
