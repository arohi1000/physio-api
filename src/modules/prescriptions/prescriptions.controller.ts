import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Phase2FeatureGuard } from '../../common/guards/phase2-feature.guard';
import type { AuditRecorder } from '../../common/audit/audit-recorder';
import { Audit } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { SignedFileUrlResponseDto } from '../files/dto/signed-file-url-response.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { PrescriptionDetailDto } from './dto/prescription-detail.dto';
import { PrescriptionsService } from './prescriptions.service';

@ApiTags('admin/prescriptions')
@ApiBearerAuth()
@Controller('admin')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  // Creation is deferred to Phase 2; reading an already-issued document is not.
  @UseGuards(Phase2FeatureGuard('prescriptions'))
  @Post('patients/:patientId/prescriptions')
  @ApiOperation({ summary: 'Issue a prescription for a patient' })
  @ApiResponse({ status: 201, type: PrescriptionDetailDto })
  @ApiResponse({ status: 404, description: 'PATIENT_NOT_FOUND' })
  async create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Audit() audit: AuditRecorder,
  ): Promise<PrescriptionDetailDto> {
    const created = await this.prescriptionsService.create(
      patientId,
      dto,
      user.id,
    );
    audit.recordEntityId(created.id);
    return created;
  }

  @Get('prescriptions/:id')
  @ApiOperation({ summary: 'Prescription detail' })
  @ApiResponse({ status: 200, type: PrescriptionDetailDto })
  @ApiResponse({ status: 404, description: 'DOCUMENT_NOT_FOUND' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PrescriptionDetailDto> {
    return this.prescriptionsService.getById(id);
  }

  @Get('prescriptions/:id/pdf')
  @ApiOperation({ summary: 'Short-lived signed URL for the prescription PDF' })
  @ApiResponse({ status: 200, type: SignedFileUrlResponseDto })
  @ApiResponse({ status: 404, description: 'DOCUMENT_NOT_FOUND' })
  getPdfUrl(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignedFileUrlResponseDto> {
    return this.prescriptionsService.getPdfUrl(id);
  }
}
