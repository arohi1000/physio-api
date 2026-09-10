import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicSettingsController } from './clinic-settings.controller';
import { ClinicSettingsService } from './clinic-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicSettingsController],
  providers: [ClinicSettingsService],
  exports: [ClinicSettingsService],
})
export class ClinicSettingsModule {}
