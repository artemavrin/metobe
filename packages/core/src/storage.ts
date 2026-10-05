import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";

// Files in S3 (D4, D33): the bundled SeaweedFS (compose profile `s3`) or any S3 named by S3_*. Optional — without it
// the app runs and the features that need files say they are off. The browser never talks to S3: uploads and downloads
// go through the app (one origin, no CORS, the app checks who may read what).

const envSchema = z.object({
  S3_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // Unset — AWS itself, by region.
  S3_ENDPOINT: z.url().optional(),
  // Path-style addressing (`host/bucket/key`) — what SeaweedFS and most self-hosted S3 need; AWS works with both.
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_SECRET_KEY: z.string().min(1),
});

export interface StorageConfig {
  bucket: string;
  client: S3Client;
}

let cached: StorageConfig | null | undefined;

/** The storage from the environment; null when S3 is not configured (no bucket or keys). */
export const getStorage = (): StorageConfig | null => {
  if (cached !== undefined) {
    return cached;
  }
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    cached = null;
    return cached;
  }
  const e = env.data;
  cached = {
    bucket: e.S3_BUCKET,
    client: new S3Client({
      credentials: {
        accessKeyId: e.S3_ACCESS_KEY,
        secretAccessKey: e.S3_SECRET_KEY,
      },
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      region: e.S3_REGION,
      // The SDK's default adds checksums to every request; some S3s reject them, and a presigned PUT then carries the
      // checksum of an empty body (spike S6). Only where an operation requires one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
  return cached;
};

const need = () => {
  const storage = getStorage();
  if (!storage) {
    throw new Error("storage-off");
  }
  return storage;
};

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentLength: number | undefined;
  contentType: string | undefined;
}

/** Writes an object whole; the length must be known (a file from a form, a buffer). */
export const putObject = async (
  key: string,
  body: Uint8Array | ReadableStream<Uint8Array>,
  options: { contentLength: number; contentType?: string }
) => {
  const { bucket, client } = need();
  await client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentLength: options.contentLength,
      ContentType: options.contentType,
      Key: key,
    })
  );
};

/** An object as a stream, or null when there is none under the key. */
export const getObject = async (key: string): Promise<StoredObject | null> => {
  const { bucket, client } = need();
  try {
    const out = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    if (!out.Body) {
      return null;
    }
    return {
      body: out.Body.transformToWebStream(),
      contentLength: out.ContentLength,
      contentType: out.ContentType,
    };
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return null;
    }
    throw error;
  }
};

export const deleteObject = async (key: string) => {
  const { bucket, client } = need();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};

/** Deletes everything under a prefix (a chat's files: `chats/<id>/`), a page of up to 1000 keys at a time. */
export const deletePrefix = async (prefix: string) => {
  const { bucket, client } = need();
  let token: string | undefined;
  let deleted = 0;
  do {
    // oxlint-disable-next-line no-await-in-loop -- each page names the next
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
        Prefix: prefix,
      })
    );
    const keys = (page.Contents ?? []).flatMap((o) =>
      o.Key ? [{ Key: o.Key }] : []
    );
    if (keys.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- a page is deleted before the next is listed
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys, Quiet: true },
        })
      );
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
};

/** For /api/health: off when not configured, ok when the bucket answers, down otherwise. */
export const checkStorage = async (): Promise<"ok" | "down" | "off"> => {
  const storage = getStorage();
  if (!storage) {
    return "off";
  }
  try {
    await storage.client.send(
      new HeadBucketCommand({ Bucket: storage.bucket }),
      { abortSignal: AbortSignal.timeout(3000) }
    );
    return "ok";
  } catch {
    return "down";
  }
};

/**
 * Where the storage is, for the admin's screen: never a key. «Bundled» — the S3 compose runs (`http://s3:8333`, which
 * install.sh writes), not one of the admin's own.
 */
export const describeStorage = () => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const env = envSchema.parse(process.env);
  return {
    bucket: env.S3_BUCKET,
    bundled: env.S3_ENDPOINT === "http://s3:8333",
    host: env.S3_ENDPOINT ? new URL(env.S3_ENDPOINT).host : "aws",
    pathStyle: env.S3_FORCE_PATH_STYLE,
    region: env.S3_REGION,
  };
};

/** What a probe found wrong, as the screen words it. */
export type StorageProblem = "auth" | "missing" | "unreachable" | "other";

export type StorageProbe =
  | { ok: true; ms: number }
  | {
      ok: false;
      step: "bucket" | "write" | "read" | "delete";
      problem: StorageProblem;
      detail: string;
    };

const problemOf = (error: unknown): StorageProblem => {
  const e = error as {
    $metadata?: { httpStatusCode?: number };
    code?: string;
    name?: string;
  };
  const status = e.$metadata?.httpStatusCode;
  if (
    status === 403 ||
    /AccessDenied|SignatureDoesNotMatch|InvalidAccessKeyId/u.test(e.name ?? "")
  ) {
    return "auth";
  }
  if (status === 404 || /NoSuchBucket|NotFound/u.test(e.name ?? "")) {
    return "missing";
  }
  if (!status) {
    return "unreachable";
  }
  return "other";
};

const signal = () => ({ abortSignal: AbortSignal.timeout(5000) });

/**
 * A real round trip, not just «the bucket answers»: the bucket, then a small object written, read back and deleted —
 * so a key that may read but not write is found now, not at the first upload. Null — the storage is off.
 */
export const probeStorage = async (): Promise<StorageProbe | null> => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const { bucket, client } = storage;
  const key = `probe/${crypto.randomUUID()}`;
  const body = new TextEncoder().encode("metobe");
  const started = Date.now();
  let step: "bucket" | "write" | "read" | "delete" = "bucket";
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }), signal());
    step = "write";
    await client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: bucket,
        ContentLength: body.byteLength,
        Key: key,
      }),
      signal()
    );
    step = "read";
    const read = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      signal()
    );
    await read.Body?.transformToByteArray();
    step = "delete";
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      signal()
    );
    return { ms: Date.now() - started, ok: true };
  } catch (error) {
    return {
      detail: (error as Error).message ?? String(error),
      ok: false,
      problem: problemOf(error),
      step,
    };
  }
};
