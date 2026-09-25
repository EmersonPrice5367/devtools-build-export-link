import assert from "node:assert/strict";
import test from "node:test";
import { buildReleaseCsv, exportRequestSchema } from "../src/export_report.js";

test("orders build history and exposes diagnostics only for failed builds", () => {
  const input = exportRequestSchema.parse({
    workspace: "creator-studio",
    requestedBy: "builder@example.com",
    builds: [
      {
        buildId: "build-2",
        project: "video-publisher",
        branch: "main",
        status: "passed",
        durationSeconds: 42,
        finishedAt: "2026-09-11T10:02:00.000Z",
        diagnostic: "should stay internal for a passing build"
      },
      {
        buildId: "build-1",
        project: "caption-renderer",
        branch: "release,sep",
        status: "failed",
        durationSeconds: 18,
        finishedAt: "2026-09-11T10:01:00.000Z",
        diagnostic: "Font \"Inter\" was missing"
      }
    ],
    releases: [{
      releaseId: "rel-9",
      buildId: "build-2",
      environment: "production",
      status: "published",
      operatedAt: "2026-09-11T10:03:00.000Z"
    }]
  });

  const lines = buildReleaseCsv(input).trimEnd().split("\n");
  assert.match(lines[1], /^build-1,caption-renderer,"release,sep",failed/);
  assert.match(lines[1], /not_released.*"Font ""Inter"" was missing"$/);
  assert.match(lines[2], /^build-2,video-publisher,main,passed/);
  assert.match(lines[2], /rel-9,production,published/);
  assert.equal(lines[2].endsWith("should stay internal for a passing build"), false);
});

test("rejects a failed build without a diagnostic", () => {
  const result = exportRequestSchema.safeParse({
    workspace: "creator-studio",
    requestedBy: "builder@example.com",
    builds: [{
      buildId: "build-3",
      project: "asset-pipeline",
      branch: "main",
      status: "failed",
      durationSeconds: 7,
      finishedAt: "2026-09-11T10:04:00.000Z"
    }],
    releases: []
  });
  assert.equal(result.success, false);
});
