import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

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
        secretAccessKey: options.secretAccessKey,
      },
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      region: options.region,
    });
  }

  async createSignedReadUrl(input: SignedReadUrlInput): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async putObject(input: StoredObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: input.bucket,
        ContentType: input.contentType,
        Key: input.key,
      }),
    );
  }

  async readObject(
    bucket: string,
    key: string,
    maxBytes: number,
  ): Promise<Buffer> {
    const signal = AbortSignal.timeout(15_000);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: signal },
    );
    const body = result.Body;
    if (!(body instanceof Readable))
      throw new Error("Unsupported storage stream.");
    if ((result.ContentLength ?? 0) > maxBytes) {
      body.destroy();
      throw new Error("Stored file exceeds the size limit.");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const abort = () => body.destroy(new Error("Storage read timed out."));
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) abort();
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > maxBytes) {
          body.destroy();
          throw new Error("Stored file exceeds the size limit.");
        }
        chunks.push(chunk);
      }
    } finally {
      signal.removeEventListener("abort", abort);
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
  }
}
