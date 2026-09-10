import { Module } from '@nestjs/common';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ServicesModule } from '../services/services.module';
import { AvailabilityBlocksController } from './availability-blocks.controller';
import { AvailabilityBlocksService } from './availability-blocks.service';
import { AvailabilityCacheService } from './availability-cache.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [PrismaModule, RedisModule, ClinicSettingsModule, ServicesModule],
  controllers: [AvailabilityController, AvailabilityBlocksController],
  providers: [
    AvailabilityService,
    AvailabilityBlocksService,
    AvailabilityCacheService,
  ],
  exports: [AvailabilityService, AvailabilityCacheService],
})
export class AvailabilityModule {}
