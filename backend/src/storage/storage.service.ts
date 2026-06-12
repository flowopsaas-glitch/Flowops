import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private config: ConfigService) {
    const accountId = config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    this.bucket = config.get<string>('CLOUDFLARE_R2_BUCKET_NAME', 'flowops-waybills');
    this.publicUrl = config.get<string>('CLOUDFLARE_R2_PUBLIC_URL', '');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID'),
        secretAccessKey: config.get<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  /** Upload a file buffer. Returns the object key. */
  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`Uploaded: ${key}`);
    return key;
  }

  /** Get a time-limited pre-signed download URL (default 1 hour). */
  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  /** Get a time-limited pre-signed upload URL (PUT). */
  async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  /** Delete an object. */
  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.debug(`Deleted: ${key}`);
  }

  /** Resolve a public URL (for buckets with a custom domain / public access). */
  publicFileUrl(key: string): string {
    return this.publicUrl ? `${this.publicUrl}/${key}` : key;
  }
}
