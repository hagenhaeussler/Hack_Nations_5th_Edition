import "dotenv/config";

const toInt = (v: string | undefined, fallback: number): number => {
  const parsed = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  port: toInt(process.env.PORT, 4000),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxUploadMb: toInt(process.env.MAX_UPLOAD_MB, 25),
} as const;
