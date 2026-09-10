import { Module } from '@nestjs/common';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

@Module({
  imports: [PrismaModule, PatientsModule, ClinicSettingsModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
})
export class FollowUpsModule {}
