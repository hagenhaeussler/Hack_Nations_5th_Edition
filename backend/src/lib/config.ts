import { config as loadDotenv } from "dotenv";

loadDotenv();
loadDotenv({ path: "backend/.env", override: false });

export type ServiceName =
  | "openai"
  | "supabase"
  | "database"
  | "storage"
  | "researchApi"
  | "embeddings";

const hasValue = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;

const supabaseConfigured =
  hasValue(supabaseUrl) && (hasValue(supabaseServiceRoleKey) || hasValue(supabaseAnonKey));
const databaseConfigured = hasValue(databaseUrl);
const openaiConfigured = hasValue(openaiApiKey);

export const config = {
  environment: process.env.NODE_ENV ?? "development",
  frontendUrl: process.env.FRONTEND_URL ?? null,
  openai: {
    enabled: openaiConfigured,
    apiKey: openaiApiKey ?? null,
  },
  supabase: {
    enabled: supabaseConfigured,
    url: supabaseUrl ?? null,
    anonKey: supabaseAnonKey ?? null,
    serviceRoleKey: supabaseServiceRoleKey ?? null,
  },
  database: {
    enabled: databaseConfigured,
    url: databaseUrl ?? null,
  },
  storage: {
    enabled: Boolean(supabaseConfigured && hasValue(supabaseServiceRoleKey)),
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "labpilot-files",
  },
  researchApi: {
    enabled:
      hasValue(process.env.GENERIC_RESEARCH_API_URL) &&
      hasValue(process.env.GENERIC_RESEARCH_API_KEY),
    url: process.env.GENERIC_RESEARCH_API_URL ?? null,
    apiKey: process.env.GENERIC_RESEARCH_API_KEY ?? null,
  },
  models: {
    high: process.env.OPENAI_HIGH_MODEL ?? "gpt-5.5",
    medium: process.env.OPENAI_MEDIUM_MODEL ?? "gpt-5.4-mini",
    small: process.env.OPENAI_SMALL_MODEL ?? "gpt-5.4-nano",
    embedding: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  },
} as const;

export function getMissingServiceMessage(serviceName: ServiceName): string {
  switch (serviceName) {
    case "openai":
      return "OpenAI API key not configured. Using local fallback agent.";
    case "supabase":
      return "Supabase is not configured. Using development fallback storage if available.";
    case "database":
      return "Database not configured. Using in-memory fallback. Data will reset on server restart.";
    case "storage":
      return "File storage not configured. Continuing without uploaded file context.";
    case "researchApi":
      return "External research API not configured. Using demo research sources.";
    case "embeddings":
      return "Embeddings not configured. Using keyword search fallback.";
  }
}

export function getSetupWarnings(): string[] {
  const warnings: string[] = [];
  if (!config.openai.enabled) warnings.push(getMissingServiceMessage("openai"));
  if (!config.researchApi.enabled) warnings.push(getMissingServiceMessage("researchApi"));
  if (!config.supabase.enabled) warnings.push(getMissingServiceMessage("supabase"));
  if (!config.database.enabled) warnings.push(getMissingServiceMessage("database"));
  if (!config.storage.enabled) warnings.push(getMissingServiceMessage("storage"));
  if (!config.openai.enabled || !config.models.embedding) {
    warnings.push(getMissingServiceMessage("embeddings"));
  }
  return Array.from(new Set(warnings));
}
