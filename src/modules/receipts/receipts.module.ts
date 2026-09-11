import { Module } from '@nestjs/common';
import { PdfModule } from '../../common/pdf/pdf.module';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';
import { FilesModule } from '../files/files.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

/**
 * Receipts are deferred to Phase 2 (PRD.md §6), but only *creation* is
 * closed — the read and PDF routes stay open. Deferring a feature must not
 * destroy access to records already created with it: a receipt the clinic
 * already issued is part of the patient's history, and a 404 on it would be a
 * data-access regression rather than a scope decision. The POST handler carries
 * the feature guard; see the controller.
 */
@Module({
  imports: [
    PrismaModule,
    PatientsModule,
    ClinicSettingsModule,
    FilesModule,
    PdfModule,
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
