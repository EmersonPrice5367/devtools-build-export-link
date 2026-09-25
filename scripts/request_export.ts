export {};

const response = await fetch("http://localhost:3000/exports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workspace: "creator-studio",
    requestedBy: "builder@example.com",
    builds: [{
      buildId: "build-1042",
      project: "thumbnail-renderer",
      branch: "release/september",
      status: "passed",
      durationSeconds: 36,
      finishedAt: "2026-09-11T09:30:00.000Z"
    }],
    releases: [{
      releaseId: "release-88",
      buildId: "build-1042",
      environment: "production",
      status: "published",
      operatedAt: "2026-09-11T09:32:00.000Z"
    }]
  })
});

console.log(JSON.stringify(await response.json(), null, 2));
