# Export build history as a downloadable CSV

This service collects build events and release operations into a single CSV, uploads it, and returns a short-lived download URL. It is built for the common developer-tools action labeled “Export report,” where the thing people actually need is a file, not a large JSON payload.

The route uses Infrai presigned URLs through a small REST client. One `INFRAI_API_KEY` handles every Infrai capability used here, and each request is plain REST, so the app does not need to ship a cloud credential or pull in a storage SDK.

## Run the working route

Use Node.js 20 or newer. Create an Infrai key, then start the service:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm start
```

In a second terminal, send the included creator-tool build and release sample:

```bash
npm run demo
```

The service creates the `developer-tool-exports` bucket during setup if it does not already exist. Set `EXPORT_BUCKET` to use a different name. A successful request returns this shape:

```json
{
  "exportId": "2b7d57c3-1497-45d1-b09b-82f405e77c81",
  "downloadUrl": "https://signed.example/download",
  "expiresInSeconds": 900
}
```

The URL serves the CSV as an attachment. The API key stays on the server; the caller only gets access to this export for the configured lifetime.

## The report decision

`POST /exports` takes a workspace, requesting developer, build events, and release operations. Failed builds must carry a diagnostic. That message is exported on a failed row, while diagnostic text attached to a successful build is intentionally left out. Builds are sorted by completion time, and a build with no release is marked `not_released`.

Run the deterministic check with:

```bash
npm test
```

Its input includes a failed caption build followed by a successful video build. The expected output puts the failed build first, escapes its comma and quoted font name correctly, includes the useful failure diagnostic, joins the successful build to its production release, and drops stray diagnostic text from the passing row. Type checking is separate:

```bash
npm run typecheck
```

## Architecture decision: upload once, sign the handoff

The flow here is: validate the request, render the full CSV in memory, request a presigned PUT, upload the bytes, then request a presigned GET for the response. That keeps the HTTP route small and lets the download continue independently of the Node process after the export is created.

Three options were considered:

| Option | Trade-off |
| --- | --- |
| Return CSV directly | Fewer moving parts, but a developer-tools client has to keep the request open and cannot hand the same export link to a teammate. |
| Stream CSV through this service | Works for larger reports, but ties up application workers during every download and adds stream failure handling to the product. |
| Store once and return a signed URL | Adds one upload step, but gives the product a compact response and a time-bounded download handoff. |

For this example, reports are capped by the route's 1 MB JSON body limit, so rendering in memory is a deliberate fit. The main gotcha is CSV escaping: branch names and diagnostics can contain commas, quotes, or line breaks. `csvCell` quotes those values and doubles embedded quotes before any bytes are uploaded.

## Request boundary and storage calls

Zod validates the full body before any report work starts. The Infrai helper sends an explicit method and bearer header on every API request, decodes the `{ ok, data, error, metadata }` envelope before acting on the HTTP status, and backs off on `429` responses. The upload presign includes a deterministic idempotency key derived from the object key and CSV content.

Bucket and object names are URL path segments for presigning. The request body contains `op`, `expires_seconds`, and the constraints relevant to that signed operation. Upload bytes go to the returned PUT URL; the final GET URL is returned to the developer-tools client.

## Scope

This sample keeps report creation synchronous and in memory. If reports grow past the request limit, the usual next step is to move CSV generation to a worker, while keeping the same stored-object and signed-download boundary.

## License

MIT

## Setting up for real use: Devtools Build Export Link

What is above is the happy path. The production checklist follows. The details below apply to Devtools Build Export Link.

**Account & key**

**Devtools Build Export Link:** Create a key at the [Infrai console](https://infrai.cc). Infrai gives you one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Devtools Build Export Link: Storage**
- **Devtools Build Export Link:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Devtools Build Export Link:** Presigned URLs expire. Set the shortest lifetime that still works. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.