import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuditRecorder } from '../../common/audit/audit-recorder';
import { Audit } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { SignedFileUrlResponseDto } from '../files/dto/signed-file-url-response.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReceiptDetailDto } from './dto/receipt-detail.dto';
import { ReceiptsService } from './receipts.service';

@ApiTags('admin/receipts')
@ApiBearerAuth()
@Controller('admin')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post('patients/:patientId/receipts')
  @ApiOperation({ summary: 'Issue a receipt for a patient' })
  @ApiResponse({ status: 201, type: ReceiptDetailDto })
  @ApiResponse({ status: 404, description: 'PATIENT_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'RECEIPT_AMOUNT_INVALID' })
  async create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
    @Audit() audit: AuditRecorder,
  ): Promise<ReceiptDetailDto> {
    const created = await this.receiptsService.create(patientId, dto, user.id);
    audit.recordEntityId(created.id);
    return created;
  }

  @Get('receipts/:id')
  @ApiOperation({ summary: 'Receipt detail' })
  @ApiResponse({ status: 200, type: ReceiptDetailDto })
  @ApiResponse({ status: 404, description: 'DOCUMENT_NOT_FOUND' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptDetailDto> {
    return this.receiptsService.getById(id);
  }

  @Get('receipts/:id/pdf')
  @ApiOperation({ summary: 'Short-lived signed URL for the receipt PDF' })
  @ApiResponse({ status: 200, type: SignedFileUrlResponseDto })
  @ApiResponse({ status: 404, description: 'DOCUMENT_NOT_FOUND' })
  getPdfUrl(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignedFileUrlResponseDto> {
    return this.receiptsService.getPdfUrl(id);
  }
}
