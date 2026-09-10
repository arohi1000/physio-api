import { Module } from '@nestjs/common';
import { PdfModule } from '../../common/pdf/pdf.module';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';
import { FilesModule } from '../files/files.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

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
