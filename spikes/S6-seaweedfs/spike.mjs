// Spike S6: what Metobe needs from the bundled S3 — SDK put/get/delete, presigned PUT and POST from a browser
// origin (CORS preflight), a size cap, presigned GET, and that the auth actually refuses a wrong key.
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:8333";
const Bucket = process.env.S3_BUCKET ?? "metobe";
const credentials = {
  accessKeyId: process.env.S3_ACCESS_KEY ?? "metobe",
  secretAccessKey: process.env.S3_SECRET_KEY ?? "s6-secret-not-for-real-use",
};
const ORIGIN = "http://localhost:3000";
// Since 2025 the SDK puts a CRC32 of the *empty* body into a presigned PUT by default
// (requestChecksumCalculation: "WHEN_SUPPORTED"), so a browser upload with a real body fails with BadDigest.
// Checksums only where an operation requires them.
const s3 = new S3Client({ credentials, endpoint, forcePathStyle: true, region: "us-east-1", requestChecksumCalculation: "WHEN_REQUIRED" });

const results = [];
const check = async (name, fn) => {
  const t = performance.now();
  try {
    const detail = await fn();
    results.push({ detail: detail ?? "", ms: Math.round(performance.now() - t), name, ok: true });
  } catch (error) {
    results.push({ detail: String(error?.message ?? error).slice(0, 200), ms: 0, name, ok: false });
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const body = Buffer.from("привет, вложение\n".repeat(1000));

await check("SDK: put, head, get, delete", async () => {
  await s3.send(new PutObjectCommand({ Body: body, Bucket, ContentType: "text/plain", Key: "sdk/a.txt" }));
  const head = await s3.send(new HeadObjectCommand({ Bucket, Key: "sdk/a.txt" }));
  const got = await s3.send(new GetObjectCommand({ Bucket, Key: "sdk/a.txt" }));
  const back = Buffer.from(await got.Body.transformToByteArray());
  expect(back.equals(body), "content differs");
  await s3.send(new DeleteObjectCommand({ Bucket, Key: "sdk/a.txt" }));
  return `${head.ContentLength} bytes, type ${head.ContentType}`;
});

await check("wrong secret is refused", async () => {
  const bad = new S3Client({ credentials: { ...credentials, secretAccessKey: "wrong" }, endpoint, forcePathStyle: true, region: "us-east-1" });
  try {
    await bad.send(new PutObjectCommand({ Body: "x", Bucket, Key: "bad.txt" }));
  } catch (error) {
    return `refused: ${error.name}`;
  }
  throw new Error("accepted a wrong secret");
});

await check("anonymous GET is refused", async () => {
  await s3.send(new PutObjectCommand({ Body: "secret", Bucket, Key: "private.txt" }));
  const r = await fetch(`${endpoint}/${Bucket}/private.txt`);
  expect(r.status === 403 || r.status === 401, `anonymous got ${r.status}`);
  return `anonymous → ${r.status}`;
});

await check("bucket CORS: set and read back", async () => {
  await s3.send(new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [{ AllowedHeaders: ["*"], AllowedMethods: ["PUT", "POST", "GET"], AllowedOrigins: [ORIGIN], ExposeHeaders: ["ETag"], MaxAgeSeconds: 600 }],
    },
  }));
  const cors = await s3.send(new GetBucketCorsCommand({ Bucket }));
  return JSON.stringify(cors.CORSRules?.[0]?.AllowedOrigins);
});

const preflight = async (url, method) => {
  const r = await fetch(url, {
    headers: { "Access-Control-Request-Headers": "content-type", "Access-Control-Request-Method": method, Origin: ORIGIN },
    method: "OPTIONS",
  });
  return { allow: r.headers.get("access-control-allow-origin"), status: r.status };
};

await check("presigned PUT from the browser origin (preflight + upload)", async () => {
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, ContentType: "text/plain", Key: "up/put.txt" }), { expiresIn: 300 });
  const pf = await preflight(url, "PUT");
  expect(pf.allow === ORIGIN, `preflight ${pf.status}, allow-origin ${pf.allow}`);
  const r = await fetch(url, { body, headers: { "Content-Type": "text/plain", Origin: ORIGIN }, method: "PUT" });
  expect(r.ok, `PUT ${r.status} ${await r.text()}`);
  return `preflight ${pf.status}, PUT ${r.status}, allow-origin ${r.headers.get("access-control-allow-origin")}`;
});

await check("presigned PUT from another origin gets no CORS", async () => {
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: "up/evil.txt" }), { expiresIn: 300 });
  const r = await fetch(url, {
    headers: { "Access-Control-Request-Method": "PUT", Origin: "http://evil.example" },
    method: "OPTIONS",
  });
  const allow = r.headers.get("access-control-allow-origin");
  expect(allow !== "http://evil.example" && allow !== "*", `allowed ${allow}`);
  return `preflight ${r.status}, allow-origin ${allow}`;
});

await check("presigned PUT can't overwrite a different key", async () => {
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: "up/one.txt" }), { expiresIn: 300 });
  const other = url.replace("up/one.txt", "up/two.txt");
  const r = await fetch(other, { body: "x", method: "PUT" });
  expect(!r.ok, "signature accepted for another key");
  return `tampered key → ${r.status}`;
});

await check("expired presigned PUT is refused", async () => {
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: "up/late.txt" }), { expiresIn: 1 });
  await new Promise((r) => setTimeout(r, 2500));
  const r = await fetch(url, { body: "x", method: "PUT" });
  expect(!r.ok, "expired URL accepted");
  return `expired → ${r.status}`;
});

const postUpload = async (size, max) => {
  const { url, fields } = await createPresignedPost(s3, {
    Bucket,
    Conditions: [["content-length-range", 1, max], ["starts-with", "$Content-Type", ""]],
    Expires: 300,
    Fields: { "Content-Type": "application/octet-stream" },
    Key: `post/${size}.bin`,
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([Buffer.alloc(size, 1)]), "f.bin");
  const r = await fetch(url, { body: form, headers: { Origin: ORIGIN }, method: "POST" });
  return { allow: r.headers.get("access-control-allow-origin"), status: r.status, text: (await r.text()).slice(0, 160) };
};

await check("presigned POST within the size cap", async () => {
  const r = await postUpload(512 * 1024, 1024 * 1024);
  expect(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`);
  return `512 KB under 1 MB cap → ${r.status}, allow-origin ${r.allow}`;
});

await check("presigned POST over the size cap is refused", async () => {
  const r = await postUpload(2 * 1024 * 1024, 1024 * 1024);
  expect(r.status >= 400, `over cap accepted: ${r.status}`);
  return `2 MB over 1 MB cap → ${r.status} ${r.text.replace(/\s+/g, " ").slice(0, 80)}`;
});

await check("presigned PUT with a signed Content-Length rejects another size", async () => {
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, ContentLength: 100, Key: "up/len.txt" }), { expiresIn: 300, signableHeaders: new Set(["content-length"]) });
  const r = await fetch(url, { body: Buffer.alloc(5000, 1), method: "PUT" });
  return r.ok ? "ACCEPTED a different size (signed length not enforced)" : `different size → ${r.status}`;
});

await check("presigned GET with a download name", async () => {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: "up/put.txt", ResponseContentDisposition: 'attachment; filename="file.txt"' }), { expiresIn: 300 });
  const r = await fetch(url, { headers: { Origin: ORIGIN } });
  const bytes = Buffer.from(await r.arrayBuffer());
  expect(r.ok && bytes.equals(body), `GET ${r.status}, ${bytes.length} bytes`);
  return `GET ${r.status}, disposition ${r.headers.get("content-disposition")}`;
});

await check("50 MB through the SDK (multipart-free put)", async () => {
  const big = Buffer.alloc(50 * 1024 * 1024, 7);
  const t = performance.now();
  await s3.send(new PutObjectCommand({ Body: big, Bucket, Key: "big/50mb.bin" }));
  const put = performance.now() - t;
  const got = await s3.send(new GetObjectCommand({ Bucket, Key: "big/50mb.bin" }));
  const back = await got.Body.transformToByteArray();
  expect(back.length === big.length, "size differs");
  await s3.send(new DeleteObjectCommand({ Bucket, Key: "big/50mb.bin" }));
  return `put ${Math.round(put)} ms, read back ${back.length} bytes`;
});

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ms ? ` (${r.ms} ms)` : ""} — ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
