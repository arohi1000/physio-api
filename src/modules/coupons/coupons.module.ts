import { Module } from '@nestjs/common';
import { isPhase2FeatureEnabled } from '../../config/phase2-features';
import { PrismaModule } from '../prisma/prisma.module';
import { ServicesModule } from '../services/services.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

/**
 * Coupons are deferred to Phase 2. The controller is registered only when the
 * feature is on, so `POST /coupons/validate` does not exist by default and no
 * coupon code can be supplied from outside.
 *
 * `CouponsService` is still provided and exported, because `AppointmentsService`
 * calls it inside the booking transaction. That code is deliberately untouched:
 * it works, it is covered by the concurrency test, and rewriting a locked
 * transaction to remove a branch that can no longer be reached would risk the
 * one thing in this system that must never be wrong. With no way to submit a
 * code, the branch is simply never taken.
 */
@Module({
  imports: [PrismaModule, ServicesModule],
  controllers: isPhase2FeatureEnabled('coupons') ? [CouponsController] : [],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
