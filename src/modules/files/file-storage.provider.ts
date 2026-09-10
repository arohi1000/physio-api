/**
 * Storage abstraction for generated documents (M3-CONTRACT.md §2.2). No S3/R2
 * credentials exist and none are coming for this milestone (project decision:
 * mocks now, real later) — every caller depends on this interface, never on a
 * concrete provider or a storage SDK, so a real cloud implementation can be
 * dropped in later (`LocalDiskFileStorageProvider` today, an S3 adapter
 * later) without touching a single call site. Same swappable shape as
 * `WhatsAppProvider`.
 */
export interface FileStorageProvider {
  /** Writes `bytes` under `key`, replacing any existing object at that key. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;

  /**
   * A short-lived, single-purpose URL to fetch the object at `key`. Never a
   * permanent public link — `ttlSeconds` bounds how long it stays valid.
   */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;

  delete(key: string): Promise<void>;
}

/** DI token — inject with `@Inject(FILE_STORAGE_PROVIDER)`. */
export const FILE_STORAGE_PROVIDER = 'FILE_STORAGE_PROVIDER';
