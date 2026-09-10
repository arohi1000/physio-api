import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AppointmentsService } from './appointments.service';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ReschedulePrefillDto } from './dto/reschedule-prefill.dto';
import { RescheduleTokenService } from './reschedule-token.service';

/** Loose enough for a real booking flow's retries, tight enough to blunt a
 * scripted slot-grabbing attempt. reCAPTCHA/hCaptcha verification of
 * `captchaToken` is Phase 7 (hardening) scope — not yet enforced here. */
const BOOKING_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
const RESCHEDULE_LOOKUP_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly rescheduleTokenService: RescheduleTokenService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(BOOKING_THROTTLE)
  @ApiOperation({ summary: 'Guest booking' })
  @ApiResponse({ status: 201, type: AppointmentResponseDto })
  @ApiResponse({ status: 409, description: 'SLOT_UNAVAILABLE' })
  @ApiResponse({
    status: 422,
    description: 'SLOT_OUTSIDE_AVAILABILITY | CONSENT_REQUIRED | COUPON_*',
  })
  book(@Body() dto: CreateAppointmentDto): Promise<AppointmentResponseDto> {
    return this.appointmentsService.bookGuest(dto);
  }

  @Public()
  @Get('reschedule/:token')
  @Throttle(RESCHEDULE_LOOKUP_THROTTLE)
  @ApiOperation({
    summary: 'Resolve a signed rebooking link to prefill data',
    description:
      'Never returns the full patient record — name and phone only. Single-use: a second call is RESCHEDULE_TOKEN_INVALID.',
  })
  @ApiResponse({ status: 200, type: ReschedulePrefillDto })
  @ApiResponse({ status: 404, description: 'RESCHEDULE_TOKEN_INVALID' })
  async resolveReschedule(
    @Param('token') token: string,
  ): Promise<ReschedulePrefillDto> {
    const payload = await this.rescheduleTokenService.resolveAndConsume(token);
    return {
      patient: {
        name: payload.patientName,
        phone: payload.patientPhone,
      },
      suggestedServiceId: payload.suggestedServiceId,
      previousAppointmentId: payload.previousAppointmentId,
    };
  }
}
