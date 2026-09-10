import { ApiProperty } from '@nestjs/swagger';

/** `Patient (list item)` — M3-CONTRACT.md §4. */
export class PatientListItemDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  readonly phone: string;

  @ApiProperty({ type: String, nullable: true })
  readonly email: string | null;

  @ApiProperty({ type: String, nullable: true })
  readonly lastVisitAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  readonly nextAppointmentAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  readonly followUpDueAt: string | null;
}

class PaginationMetaDto {
  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly limit: number;

  @ApiProperty()
  readonly total: number;

  @ApiProperty()
  readonly totalPages: number;
}

export class PaginatedPatientsDto {
  @ApiProperty({ type: [PatientListItemDto] })
  readonly data: PatientListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  readonly meta: PaginationMetaDto;
}
