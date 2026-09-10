import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvironmentVariables } from '../../config/environment';
import { AvailabilityModule } from '../availability/availability.module';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';
import { CouponsModule } from '../coupons/coupons.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ServicesModule } from '../services/services.module';
import { AdminAppointmentsController } from './admin-appointments.controller';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { RescheduleTokenService } from './reschedule-token.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ServicesModule,
    PatientsModule,
    CouponsModule,
    AvailabilityModule,
    ClinicSettingsModule,
    // A dedicated JwtService bound to RESCHEDULE_TOKEN_SECRET — separate from
    // AuthModule's CRM-token JwtService (different secret, different audience,
    // different exposure: these tokens go to unauthenticated patients).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('RESCHEDULE_TOKEN_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AppointmentsController, AdminAppointmentsController],
  providers: [AppointmentsService, RescheduleTokenService],
  exports: [AppointmentsService, RescheduleTokenService],
})
export class AppointmentsModule {}
