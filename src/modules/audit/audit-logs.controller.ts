import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLogService } from './audit-log.service';
import { AuditLogPageDto } from './dto/audit-log.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

/** Backs the CRM's Activity Log view. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@Roles(UserRole.doctor_admin)
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries, newest first' })
  @ApiResponse({ status: 200, type: AuditLogPageDto })
  @ApiResponse({ status: 403, description: 'Requires the doctor_admin role' })
  list(@Query() query: QueryAuditLogsDto): Promise<AuditLogPageDto> {
    return this.auditLogService.list(query);
  }
}
