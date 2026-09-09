import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  HealthCheckResponseDto,
  HealthStatus,
} from './dto/health-check-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Report reachability of PostgreSQL and Redis.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All dependencies are reachable.',
    type: HealthCheckResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'At least one dependency is unreachable.',
    type: HealthCheckResponseDto,
  })
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthCheckResponseDto> {
    const result = await this.healthService.check();

    response.status(
      result.status === HealthStatus.Ok
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return result;
  }
}
