import express from "express";
import { ZodError } from "zod";
import { exportRequestSchema } from "./export_report.js";
import { InfraiError } from "./infrai_storage.js";
import { publishBuildExport } from "./signed_download.js";

export const service = express();
service.use(express.json({ limit: "1mb" }));

service.post("/exports", async (request, response) => {
  try {
    const input = exportRequestSchema.parse(request.body);
    const result = await publishBuildExport(input);
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid_export_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, message: error.message });
      return;
    }
    response.status(500).json({ error: "export_failed" });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  service.listen(port, () => console.log(`Export service listening on http://localhost:${port}`));
}
