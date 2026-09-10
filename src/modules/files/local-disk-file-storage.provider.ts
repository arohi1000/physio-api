import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import type { FileStorageProvider } from './file-storage.provider';

interface StoredMetadata {
  readonly contentType: string;
}

/**
 * Dev/CI implementation of {@link FileStorageProvider}: writes to a gitignored
 * directory on local disk rather than an object store. M3-CONTRACT.md §2.2 —
 * no S3/R2 credentials exist for this project, so this is the only
 * implementation today; an S3 adapter can be added later behind the same
 * interface without touching a caller.
 *
 * "Signed URL" here is a self-verifying URL (HMAC over key + expiry) rather
 * than a cloud provider's presigned request — same guarantee (short-lived,
 * single-purpose, cannot be forged or extended), no external dependency.
 * `FilesController` is the only other code that understands this URL shape.
 */
@Injectable()
export class LocalDiskFileStorageProvider implements FileStorageProvider {
  private readonly rootDir: string;
  private readonly signingSecret: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.rootDir = resolve(
      configService.get('FILE_STORAGE_DIR', { infer: true }),
    );
    this.signingSecret = configService.get('FILE_STORAGE_SIGNING_SECRET', {
      infer: true,
    });
    this.publicBaseUrl = configService.get('PUBLIC_API_BASE_URL', {
      infer: true,
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    const metadata: StoredMetadata = { contentType };
    await writeFile(`${filePath}.meta.json`, JSON.stringify(metadata));
  }

  // No I/O needed to build the URL — synchronous, but returns a Promise to
  // satisfy `FileStorageProvider`, whose contract allows a real cloud
  // implementation to call out to a signing service.
  getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const signature = this.sign(key, expiresAt);
    const query = new URLSearchParams({
      key,
      expiresAt: String(expiresAt),
      signature,
    });
    return Promise.resolve(
      `${this.publicBaseUrl}/api/v1/files/download?${query.toString()}`,
    );
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await unlinkIfExists(filePath);
    await unlinkIfExists(`${filePath}.meta.json`);
  }

  /**
   * Verifies a signed URL's signature and expiry, then returns the bytes and
   * content type for {@link FilesController} to stream. Throws
   * `NotFoundException` for anything wrong — expired, forged or missing —
   * rather than distinguishing the cases, so an attacker probing the endpoint
   * learns nothing about which failure mode they hit.
   */
  async readForDownload(
    key: string,
    expiresAt: number,
    signature: string,
  ): Promise<{ bytes: Buffer; contentType: string }> {
    if (
      !Number.isFinite(expiresAt) ||
      Date.now() > expiresAt ||
      !this.isValidSignature(key, expiresAt, signature)
    ) {
      throw new NotFoundException('This link has expired or is invalid.');
    }

    const filePath = this.resolveKeyPath(key);
    try {
      const [bytes, metadataRaw] = await Promise.all([
        readFile(filePath),
        readFile(`${filePath}.meta.json`, 'utf-8'),
      ]);
      const metadata = JSON.parse(metadataRaw) as StoredMetadata;
      return { bytes, contentType: metadata.contentType };
    } catch {
      throw new NotFoundException('This link has expired or is invalid.');
    }
  }

  private sign(key: string, expiresAt: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${key}:${expiresAt}`)
      .digest('hex');
  }

  private isValidSignature(
    key: string,
    expiresAt: number,
    signature: string,
  ): boolean {
    const expected = Buffer.from(this.sign(key, expiresAt), 'hex');
    const actual = Buffer.from(signature, 'hex');
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  /**
   * Every key this codebase generates is a controlled `<segment>/<uuid>.pdf`
   * path, never user input — this check is defence in depth against a future
   * caller passing one through unsanitised, not a defence against the current
   * callers.
   */
  private resolveKeyPath(key: string): string {
    const filePath = normalize(join(this.rootDir, key));
    if (!filePath.startsWith(this.rootDir)) {
      throw new Error(
        `Refusing to resolve a storage key outside its root: ${key}`,
      );
    }
    return filePath;
  }
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
