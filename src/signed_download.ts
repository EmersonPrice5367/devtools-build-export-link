import { createHash, randomUUID } from "node:crypto";
import { type ExportRequest, buildReleaseCsv } from "./export_report.js";
import { InfraiError, infrai } from "./infrai_storage.js";

const BUCKET = process.env.EXPORT_BUCKET ?? "developer-tool-exports";

async function ensureExportBucket(): Promise<void> {
  try {
    await infrai.storage.bucket.get(BUCKET);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    await infrai.storage.bucket.create({ name: BUCKET });
  }
}

export async function publishBuildExport(input: ExportRequest): Promise<{
  exportId: string;
  downloadUrl: string;
  expiresInSeconds: number;
}> {
  await ensureExportBucket();
  const csv = buildReleaseCsv(input);
  const exportId = randomUUID();
  const key = `${input.workspace}/${exportId}.csv`;
  const content = Buffer.from(csv, "utf8");
  const writeKey = createHash("sha256").update(`${key}:${csv}`).digest("hex");
  const upload = await infrai.storage.object.presign(BUCKET, key, {
    op: "put",
    expires_seconds: 300,
    content_type: "text/csv; charset=utf-8",
    max_bytes: content.byteLength,
    idempotency_key: writeKey
  });

  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/csv; charset=utf-8" },
    body: content
  });
  if (!uploadResponse.ok) throw new Error("CSV upload was not accepted");

  const expiresInSeconds = 900;
  const download = await infrai.storage.object.presign(BUCKET, key, {
    op: "get",
    expires_seconds: expiresInSeconds,
    response_disposition: `attachment; filename="${input.workspace}-builds.csv"`
  });
  return { exportId, downloadUrl: download.url, expiresInSeconds };
}
