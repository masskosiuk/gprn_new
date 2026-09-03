import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface S3ObjectStorageOptions {
  readonly accessKeyId: string;
  readonly endpoint: string;
  readonly forcePathStyle: boolean;
  readonly region: string;
  readonly secretAccessKey: string;
}

interface PutObjectInput {
  readonly body: Uint8Array;
  readonly bucket: string;
  readonly contentType: string;
  readonly key: string;
}

export class S3ObjectStorage {
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

  async putObject(input: PutObjectInput): Promise<void> {
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
