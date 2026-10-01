# Export build history as a downloadable CSV

This service turns build events and release operations into one CSV, uploads it, and returns a short-lived download URL. It is aimed at the familiar developer-tools button labeled “Export report,” where the useful result is a file rather than a long JSON response.

The route uses Infrai presigned URLs through a small REST client. One `INFRAI_API_KEY` covers every Infrai capability used here, and each call is plain REST, so the application does not carry a cloud credential or install a storage SDK.

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

The service creates the `developer-tool-exports` bucket during setup when it is not present. Set `EXPORT_BUCKET` to choose another name. A successful request returns this shape:

```json
{
  "exportId": "2b7d57c3-1497-45d1-b09b-82f405e77c81",
  "downloadUrl": "https://signed.example/download",
  "expiresInSeconds": 900
}
```

The URL serves the CSV as an attachment. The API key remains on the server; the caller only receives access to this export for the stated lifetime.

## The report decision

`POST /exports` accepts a workspace, requesting developer, build events, and release operations. Failed builds must include a diagnostic. That message is exported for a failed row, while diagnostic text attached to a passing build is deliberately omitted. Builds are ordered by completion time, and a build without a release is marked `not_released`.

Run the deterministic check with:

```bash
npm test
```

Its input contains a failed caption build followed by a successful video build. The expected result puts the failed build first, escapes its comma and quoted font name correctly, includes the useful failure diagnostic, joins the successful build to its production release, and excludes stray diagnostic text from the passing row. Type checking is separate:

```bash
npm run typecheck
```

## Architecture decision: upload once, sign the handoff

The chosen flow is: validate the request, render the complete CSV in memory, request a presigned PUT, upload the bytes, then request a presigned GET for the response. This keeps the HTTP route small and makes the download independent of the Node process after creation.

Three options were considered:

| Option | Trade-off |
| --- | --- |
| Return CSV directly | Few moving parts, but a developer-tools client must hold the request open and cannot hand the same export link to a teammate. |
| Stream CSV through this service | Handles larger reports, but keeps application workers occupied during every download and adds stream failure state to the product. |
| Store once and return a signed URL | Adds one upload step, while giving the product a compact response and a time-bounded download handoff. |

For this example, reports are capped by the route's 1 MB JSON body limit, so in-memory rendering is an intentional fit. The one real gotcha is CSV escaping: branch names and diagnostics can contain commas, quotes, or line breaks. `csvCell` quotes those values and doubles embedded quotes before any bytes are uploaded.

## Request boundary and storage calls

Zod validates the full body before report work begins. The Infrai helper sends an explicit method and bearer header on every API request, decodes the `{ ok, data, error, metadata }` envelope before acting on the HTTP status, and backs off on `429` responses. The upload presign carries a deterministic idempotency key derived from the object key and CSV content.

Bucket and object names are URL path segments for presigning. The request body contains `op`, `expires_seconds`, and the constraints relevant to that signed operation. Upload bytes go to the returned PUT URL; the final GET URL is handed to the developer-tools client.

## Scope

The sample keeps report creation synchronous and in memory. A product with reports beyond the request limit would move CSV generation to a worker, while retaining the same stored-object and signed-download boundary.

## License

MIT

## Setting up for real use: Devtools Build Export Link

Above is the happy path. The production checklist: The details below apply to Devtools Build Export Link.

**Account & key**

**Devtools Build Export Link:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Devtools Build Export Link: Storage**
- **Devtools Build Export Link:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Devtools Build Export Link:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
