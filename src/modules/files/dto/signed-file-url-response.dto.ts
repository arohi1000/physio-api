import { ApiProperty } from '@nestjs/swagger';

/** Shape of `GET .../pdf` (M3-CONTRACT.md §3, §5): a short-lived signed URL,
 * never the bytes inline and never a permanent path. */
export class SignedFileUrlResponseDto {
  @ApiProperty()
  readonly url: string;

  @ApiProperty()
  readonly expiresAt: string;
}
