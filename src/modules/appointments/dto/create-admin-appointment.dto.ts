import { OmitType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto';

/** Manual/walk-in booking: same slot rules, no bot-defense token needed for
 * a staff-entered booking. */
export class CreateAdminAppointmentDto extends OmitType(CreateAppointmentDto, [
  'captchaToken',
] as const) {}
