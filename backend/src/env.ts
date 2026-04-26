import "dotenv/config";

const toInt = (v: string | undefined, fallback: number): number => {
  const parsed = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  port: toInt(process.env.PORT, 4000),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxUploadMb: toInt(process.env.MAX_UPLOAD_MB, 25),
  /**
   * Postgres connection string. When unset, the projects repo falls back to
   * an in-memory store so the dev server still boots end-to-end.
   * Format matches Supabase / standard libpq: `postgres://user:pass@host:port/db`.
   */
  databaseUrl: process.env.DATABASE_URL ?? null,
  /**
   * How long the mocked research / generation calls "think" for, in ms.
   * The MVP spec calls for ~10s, so low local overrides are clamped back up.
   */
  mockLatencyMs: Math.max(toInt(process.env.MOCK_LATENCY_MS, 10_000), 10_000),
} as const;
