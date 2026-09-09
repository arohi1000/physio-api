import { ApiProperty } from '@nestjs/swagger';

export enum HealthStatus {
  Ok = 'ok',
  Error = 'error',
}

export enum DependencyStatus {
  Up = 'up',
  Down = 'down',
}

export class DependencyHealthDto {
  @ApiProperty({ enum: DependencyStatus })
  readonly status: DependencyStatus;

  @ApiProperty({ description: 'Round-trip time of the reachability probe.' })
  readonly latencyMs: number;
}

export class HealthDependenciesDto {
  @ApiProperty({ type: DependencyHealthDto })
  readonly database: DependencyHealthDto;

  @ApiProperty({ type: DependencyHealthDto })
  readonly redis: DependencyHealthDto;
}

export class HealthCheckResponseDto {
  @ApiProperty({
    enum: HealthStatus,
    description: '"error" when any dependency is unreachable.',
  })
  readonly status: HealthStatus;

  @ApiProperty({ type: HealthDependenciesDto })
  readonly dependencies: HealthDependenciesDto;
}
