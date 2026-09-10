import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FILE_STORAGE_PROVIDER } from './file-storage.provider';
import { LocalDiskFileStorageProvider } from './local-disk-file-storage.provider';

/**
 * Owns the `FileStorageProvider` abstraction (M3-CONTRACT.md §2.2). No SDK
 * import for a real object store belongs anywhere outside this module — swap
 * `useClass` here for an S3 adapter when credentials exist, and nothing else
 * in the codebase changes.
 */
@Module({
  controllers: [FilesController],
  providers: [
    LocalDiskFileStorageProvider,
    {
      provide: FILE_STORAGE_PROVIDER,
      useExisting: LocalDiskFileStorageProvider,
    },
  ],
  exports: [FILE_STORAGE_PROVIDER],
})
export class FilesModule {}
