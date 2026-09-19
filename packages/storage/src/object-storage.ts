import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoredObjectInput {
  readonly body: PutObjectCommandInput["Body"];
  readonly bucket: string;
  readonly contentType: string;
  readonly key: string;
}

export interface SignedReadUrlInput {
  readonly bucket: string;
  readonly expiresInSeconds: number;
  readonly key: string;
}

export interface ObjectStorage {
  createSignedReadUrl(input: SignedReadUrlInput): Promise<string>;
  putObject(input: StoredObjectInput): Promise<void>;
}

export interface S3ObjectStorageOptions {
  readonly accessKeyId: string;
  readonly endpoint: string;
  readonly forcePathStyle: boolean;
  readonly region: string;
  readonly secretAccessKey: string;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(options: S3ObjectStorageOptions) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey
      },
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      region: options.region
    });
  }

  async createSignedReadUrl(input: SignedReadUrlInput): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key
      }),
      { expiresIn: input.expiresInSeconds }
    );
  }

  async putObject(input: StoredObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: input.bucket,
        ContentType: input.contentType,
        Key: input.key
      })
    );
  }
}

