import {
  Body,
  Controller,
  Delete,
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
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientDetailDto } from './dto/patient-detail.dto';
import { PaginatedPatientsDto } from './dto/patient-list-item.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

/**
 * Per M3-CONTRACT.md §3 / PLAN.md decision 4: staff may do everything here —
 * only patient deletion is `doctor_admin`-only.
 */
@ApiTags('admin/patients')
@ApiBearerAuth()
@Controller('admin/patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'Search patients by name, phone or email' })
  @ApiResponse({ status: 200, type: PaginatedPatientsDto })
  search(@Query() query: QueryPatientsDto): Promise<PaginatedPatientsDto> {
    return this.patientsService.search(query);
  }

  @Post()
  @ApiOperation({ summary: 'Manual / walk-in add' })
  @ApiResponse({ status: 201, type: PatientDetailDto })
  @ApiResponse({ status: 409, description: 'PATIENT_PHONE_TAKEN' })
  create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PatientDetailDto> {
    return this.patientsService.create(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full patient history aggregate' })
  @ApiResponse({ status: 200, type: PatientDetailDto })
  @ApiResponse({ status: 404, description: 'PATIENT_NOT_FOUND' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PatientDetailDto> {
    return this.patientsService.getAggregate(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a patient' })
  @ApiResponse({ status: 200, type: PatientDetailDto })
  @ApiResponse({ status: 404, description: 'PATIENT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'PATIENT_PHONE_TAKEN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ): Promise<PatientDetailDto> {
    return this.patientsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.doctor_admin)
  @ApiOperation({ summary: 'Soft delete a patient (doctor_admin only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'PATIENT_NOT_FOUND' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.patientsService.softDelete(id);
  }
}
