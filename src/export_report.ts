import { z } from "zod";

const buildEventSchema = z.object({
  buildId: z.string().min(1),
  project: z.string().min(1),
  branch: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  durationSeconds: z.number().int().nonnegative(),
  finishedAt: z.string().datetime(),
  diagnostic: z.string().min(1).optional()
}).superRefine((event, context) => {
  if (event.status === "failed" && !event.diagnostic) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["diagnostic"],
      message: "failed builds need a developer-facing diagnostic"
    });
  }
});

const releaseOperationSchema = z.object({
  releaseId: z.string().min(1),
  buildId: z.string().min(1),
  environment: z.enum(["preview", "production"]),
  status: z.enum(["published", "rolled_back", "blocked"]),
  operatedAt: z.string().datetime()
});

export const exportRequestSchema = z.object({
  workspace: z.string().min(1),
  requestedBy: z.string().email(),
  builds: z.array(buildEventSchema).min(1),
  releases: z.array(releaseOperationSchema)
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildReleaseCsv(input: ExportRequest): string {
  const releasesByBuild = new Map(input.releases.map((release) => [release.buildId, release]));
  const header = [
    "build_id", "project", "branch", "build_status", "duration_seconds",
    "finished_at", "release_id", "environment", "release_status", "operated_at", "diagnostic"
  ];
  const rows = [...input.builds]
    .sort((left, right) => left.finishedAt.localeCompare(right.finishedAt))
    .map((build) => {
      const release = releasesByBuild.get(build.buildId);
      return [
        build.buildId,
        build.project,
        build.branch,
        build.status,
        build.durationSeconds,
        build.finishedAt,
        release?.releaseId ?? "",
        release?.environment ?? "",
        release?.status ?? "not_released",
        release?.operatedAt ?? "",
        build.status === "failed" ? build.diagnostic ?? "" : ""
      ].map(csvCell).join(",");
    });

  return [header.join(","), ...rows].join("\n") + "\n";
}
