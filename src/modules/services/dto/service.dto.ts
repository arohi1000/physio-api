import { ApiProperty } from '@nestjs/swagger';

export class ServiceDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'Manual Therapy Session' })
  readonly name: string;

  @ApiProperty()
  readonly description: string;

  @ApiProperty({ type: String, nullable: true, example: 'https://…' })
  readonly demoVideoUrl: string | null;

  @ApiProperty({
    example: '1000.00',
    description: 'Decimal rupees, never a float',
  })
  readonly price: string;

  @ApiProperty({ example: 45 })
  readonly durationMinutes: number;
}
