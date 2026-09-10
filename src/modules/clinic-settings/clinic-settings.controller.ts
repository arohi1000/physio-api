import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClinicSettingsService } from './clinic-settings.service';
import { ClinicSettingsDto } from './dto/clinic-settings.dto';
import { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';

@ApiTags('admin/clinic-settings')
@ApiBearerAuth()
@Controller('admin/clinic-settings')
export class ClinicSettingsController {
  constructor(private readonly clinicSettingsService: ClinicSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Read the clinic-wide settings and working hours' })
  @ApiResponse({ status: 200, type: ClinicSettingsDto })
  getSettings(): Promise<ClinicSettingsDto> {
    return this.clinicSettingsService.getSettings();
  }

  @Put()
  @Roles(UserRole.doctor_admin)
  @ApiOperation({
    summary: 'Update the clinic-wide settings and working hours',
  })
  @ApiResponse({ status: 200, type: ClinicSettingsDto })
  updateSettings(
    @Body() dto: UpdateClinicSettingsDto,
  ): Promise<ClinicSettingsDto> {
    return this.clinicSettingsService.updateSettings(dto);
  }
}
