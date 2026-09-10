import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AvailabilityService } from './availability.service';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { QueryAvailabilityDto } from './dto/query-availability.dto';

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Bookable slots for a service on a local calendar date',
    description:
      'An empty `slots` array is a valid, non-error response (fully booked or a closed day). Redis-cached ~60s.',
  })
  @ApiResponse({ status: 200, type: AvailabilityResponseDto })
  getAvailability(
    @Query() query: QueryAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    return this.availabilityService.getAvailability(
      query.serviceId,
      query.date,
    );
  }
}
