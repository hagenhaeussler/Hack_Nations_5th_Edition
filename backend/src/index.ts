import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { env } from "./env.js";
import { getMissingServiceMessage } from "./lib/config.js";
import { ensureSchema, getPool } from "./lib/db.js";
import chatRouter from "./routes/chat.js";
import creatorAgentRouter from "./routes/creatorAgent.js";
import healthRouter from "./routes/health.js";
import jobsRouter from "./routes/jobs.js";
import lessonsRouter from "./routes/lessons.js";
import plansRouter from "./routes/plans.js";
import projectsRouter from "./routes/projects.js";

export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);
app.use("/api/creator-agent", creatorAgentRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/lessons", lessonsRouter);
app.use("/api/plans", plansRouter);
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

export async function bootstrap(): Promise<void> {
  // Bring the schema up-to-date when a database is configured. Without one,
  // the repo silently falls back to its in-memory implementation and the
  // dev server still boots — handy when iterating on UI before Postgres is
  // wired up.
  if (getPool()) {
    try {
      await ensureSchema();
      console.log("[labpilot] postgres schema ensured");
    } catch (err) {
      console.error("[labpilot] failed to ensure schema; continuing with readable endpoint errors", err);
    }
  } else {
    console.warn(`[labpilot] ${getMissingServiceMessage("database")}`);
  }

  app.listen(env.port, () => {
    console.log(
      `[labpilot] backend listening on http://localhost:${env.port} ` +
        `(uploads → ${env.uploadDir}, max ${env.maxUploadMb}MB, mock latency ${env.mockLatencyMs}ms)`,
    );
  });
}

if (process.env.VERCEL !== "1") {
  void bootstrap();
}

export default app;
