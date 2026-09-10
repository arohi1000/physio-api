import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuditRecorder } from '../../common/audit/audit-recorder';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import {
  FollowUpResponseDto,
  PaginatedFollowUpsDto,
} from './dto/follow-up-response.dto';
import { QueryFollowUpsDto } from './dto/query-follow-ups.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { FollowUpsService } from './follow-ups.service';

@ApiTags('admin/follow-ups')
@ApiBearerAuth()
@Controller('admin')
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post('patients/:patientId/follow-ups')
  @ApiOperation({ summary: 'Log a follow-up for a patient' })
  @ApiResponse({ status: 201, type: FollowUpResponseDto })
  @ApiResponse({ status: 404, description: 'PATIENT_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'FOLLOW_UP_DATE_IN_PAST' })
  async create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    // Without this, the audit interceptor's entity-id fallback would pick
    // `:patientId` off the route — a valid UUID, but the wrong entity for a
    // `follow_up.create` row.
    @Audit() audit: AuditRecorder,
  ): Promise<FollowUpResponseDto> {
    const created = await this.followUpsService.create(patientId, dto, user.id);
    audit.recordEntityId(created.id);
    return created;
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'The follow-up queue' })
  @ApiResponse({ status: 200, type: PaginatedFollowUpsDto })
  list(@Query() query: QueryFollowUpsDto): Promise<PaginatedFollowUpsDto> {
    return this.followUpsService.list(query);
  }

  @Patch('follow-ups/:id')
  @ApiOperation({ summary: 'Update a follow-up: status, target date, purpose' })
  @ApiResponse({ status: 200, type: FollowUpResponseDto })
  @ApiResponse({ status: 404, description: 'FOLLOW_UP_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'FOLLOW_UP_DATE_IN_PAST' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFollowUpDto,
  ): Promise<FollowUpResponseDto> {
    return this.followUpsService.update(id, dto);
  }
}
