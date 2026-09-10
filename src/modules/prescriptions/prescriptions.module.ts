import { Module } from '@nestjs/common';
import { PdfModule } from '../../common/pdf/pdf.module';
import { ClinicSettingsModule } from '../clinic-settings/clinic-settings.module';
import { FilesModule } from '../files/files.module';
import { PatientsModule } from '../patients/patients.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  imports: [
    PrismaModule,
    PatientsModule,
    ClinicSettingsModule,
    FilesModule,
    PdfModule,
  ],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
})
export class PrescriptionsModule {}
