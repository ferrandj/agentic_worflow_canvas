import express from "express";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "./config.js";
import { configRoutes } from "./routes/config.routes.js";
import { canvasesRoutes } from "./routes/canvases.routes.js";
import { mermaidRoutes } from "./routes/mermaid.routes.js";

export interface AppDeps {
  configDir: string;
}

export function buildApp(deps: AppDeps) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  const config = new ConfigStore(deps.configDir);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: 2 });
  });

  app.use("/api/config", configRoutes(config));
  app.use("/api/canvases", canvasesRoutes(config));
  app.use("/api/import", mermaidRoutes(config));

  // Serve the built frontend in production (dist/ exists after `npm run build`).
  const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(join(distDir, "index.html"));
    });
  }

  // Central error handler: normalize to { error, message }
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const anyErr = err as { status?: number; code?: string; message?: string; details?: unknown };
      const status = anyErr.status ?? 500;
      res.status(status).json({
        error: anyErr.code ?? "InternalError",
        message: anyErr.message ?? "Unexpected error",
        ...(anyErr.details ? { details: anyErr.details } : {}),
      });
    }
  );

  return app;
}
