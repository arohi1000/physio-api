import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { AppointmentsService } from './appointments.service';
import {
  AdminAppointmentDetailDto,
  PaginatedAdminAppointmentsDto,
} from './dto/admin-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAdminAppointmentDto } from './dto/create-admin-appointment.dto';
import { QueryAdminAppointmentsDto } from './dto/query-admin-appointments.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@ApiTags('admin/appointments')
@ApiBearerAuth()
@Controller('admin/appointments')
export class AdminAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List appointments, filtered and paginated' })
  @ApiResponse({ status: 200, type: PaginatedAdminAppointmentsDto })
  list(
    @Query() query: QueryAdminAppointmentsDto,
  ): Promise<PaginatedAdminAppointmentsDto> {
    return this.appointmentsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Appointment detail' })
  @ApiResponse({ status: 200, type: AdminAppointmentDetailDto })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminAppointmentDetailDto> {
    return this.appointmentsService.getById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Manual / walk-in booking',
    description: 'Same slot rules as the public booking endpoint.',
  })
  @ApiResponse({ status: 201, type: AdminAppointmentDetailDto })
  async create(
    @Body() dto: CreateAdminAppointmentDto,
  ): Promise<AdminAppointmentDetailDto> {
    const created = await this.appointmentsService.bookAdmin(dto);
    return this.appointmentsService.getById(created.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Reschedule or change the status of an appointment',
  })
  @ApiResponse({ status: 200, type: AdminAppointmentDetailDto })
  @ApiResponse({ status: 409, description: 'SLOT_UNAVAILABLE' })
  @ApiResponse({ status: 422, description: 'SLOT_OUTSIDE_AVAILABILITY' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<AdminAppointmentDetailDto> {
    return this.appointmentsService.update(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @AuditAction('appointment.cancel')
  @ApiOperation({ summary: 'Cancel an appointment' })
  @ApiResponse({ status: 200, type: AdminAppointmentDetailDto })
  @ApiResponse({ status: 422, description: 'APPOINTMENT_NOT_CANCELLABLE' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminAppointmentDetailDto> {
    return this.appointmentsService.cancel(id, dto.reason, user.id);
  }
}
