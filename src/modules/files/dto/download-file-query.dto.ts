import { IsNumberString, IsString, MinLength } from 'class-validator';

/** Query shape of a `LocalDiskFileStorageProvider` signed URL. Internal — not
 * part of the public contract (see `FilesController`). */
export class DownloadFileQueryDto {
  @IsString()
  @MinLength(1)
  readonly key: string;

  @IsNumberString()
  readonly expiresAt: string;

  @IsString()
  @MinLength(1)
  readonly signature: string;
}
