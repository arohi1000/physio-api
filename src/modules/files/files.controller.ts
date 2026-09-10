import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { DownloadFileQueryDto } from './dto/download-file-query.dto';
import { LocalDiskFileStorageProvider } from './local-disk-file-storage.provider';

/**
 * Serves the bytes behind a `LocalDiskFileStorageProvider` signed URL.
 * `@Public()`: the URL's own HMAC signature and expiry are the access
 * control, exactly as a cloud provider's presigned GET needs no bearer token
 * — the CRM opens this URL directly in a new tab.
 *
 * Excluded from the published Swagger document: it is an internal
 * implementation detail of the local-disk provider, not part of the API
 * contract frontends code against (they only ever see the opaque `url` field
 * `GET .../pdf` returns).
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(private readonly storage: LocalDiskFileStorageProvider) {}

  @Public()
  @Get('download')
  async download(
    @Query() query: DownloadFileQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, contentType } = await this.storage.readForDownload(
      query.key,
      Number(query.expiresAt),
      query.signature,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  }
}
