import { config as loadDotenv } from "dotenv";

loadDotenv();
loadDotenv({ path: "backend/.env", override: false });

const toInt = (v: string | undefined, fallback: number): number => {
  const parsed = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const defaultMockLatencyMs = 0;

export const env = {
  port: toInt(process.env.PORT, 4000),
  uploadDir: process.env.UPLOAD_DIR ?? (process.env.VERCEL === "1" ? "/tmp/labpilot-uploads" : "./uploads"),
  maxUploadMb: toInt(process.env.MAX_UPLOAD_MB, 25),
  /**
   * Postgres connection string. When unset, the projects repo falls back to
   * an in-memory store so the dev server still boots end-to-end.
   * Format matches Supabase / standard libpq: `postgres://user:pass@host:port/db`.
   */
  databaseUrl: process.env.DATABASE_URL ?? null,
  /**
   * How long the mocked research / generation calls "think" for, in ms.
   * Defaults to no artificial delay so long-running AI/search calls do not
   * trip serverless or proxy timeouts. Dev can opt into the loading demo.
   */
  mockLatencyMs: Math.max(toInt(process.env.MOCK_LATENCY_MS, defaultMockLatencyMs), 0),
} as const;
