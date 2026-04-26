import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { env } from "./env.js";
import { ensureSchema, getPool } from "./lib/db.js";
import chatRouter from "./routes/chat.js";
import healthRouter from "./routes/health.js";
import projectsRouter from "./routes/projects.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);
app.use("/api/projects", projectsRouter);

app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[labpilot] unhandled error", err);
  res.status(500).json({
    ok: false,
    error: err instanceof Error ? err.message : "Unknown error",
  });
};
app.use(errorHandler);

async function bootstrap(): Promise<void> {
  // Bring the schema up-to-date when a database is configured. Without one,
  // the repo silently falls back to its in-memory implementation and the
  // dev server still boots — handy when iterating on UI before Postgres is
  // wired up.
  if (getPool()) {
    try {
      await ensureSchema();
      console.log("[labpilot] postgres schema ensured");
    } catch (err) {
      console.error("[labpilot] failed to ensure schema", err);
      process.exit(1);
    }
  } else {
    console.warn(
      "[labpilot] DATABASE_URL not set — projects are stored in memory only.",
    );
  }

  app.listen(env.port, () => {
    console.log(
      `[labpilot] backend listening on http://localhost:${env.port} ` +
        `(uploads → ${env.uploadDir}, max ${env.maxUploadMb}MB, mock latency ${env.mockLatencyMs}ms)`,
    );
  });
}

void bootstrap();
