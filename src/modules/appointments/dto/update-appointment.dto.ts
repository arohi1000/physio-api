import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

/**
 * Reschedule (`startsAt`) or change status. Cancellation has its own
 * endpoint (`POST /:id/cancel`) so a reason is always captured — this DTO
 * intentionally does not accept `status: 'cancelled'`.
 */
export class UpdateAppointmentDto {
  @ApiPropertyOptional({ example: '2026-03-06T04:30:00.000Z' })
  @IsOptional()
  @IsISO8601()
  readonly startsAt?: string;

  @ApiPropertyOptional({
    enum: [AppointmentStatus.completed, AppointmentStatus.no_show],
  })
  @IsOptional()
  @IsEnum([AppointmentStatus.completed, AppointmentStatus.no_show])
  readonly status?: 'completed' | 'no_show';
}
