import { config as loadDotenv } from "dotenv";

loadDotenv();
loadDotenv({ path: "backend/.env", override: false });

export type ServiceName =
  | "openai"
  | "supabase"
  | "database"
  | "storage"
  | "researchApi"
  | "embeddings"
  | "tavily";

const hasValue = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
const openaiResearchStepTimeoutMs = Number.parseInt(
  process.env.OPENAI_RESEARCH_STEP_TIMEOUT_MS ?? "3000",
  10,
);
const openAlexEnabled = process.env.OPENALEX_ENABLED !== "false";
const openAlexMaxResults = Number.parseInt(process.env.OPENALEX_MAX_RESULTS ?? "24", 10);
const openAlexMaxQueries = Number.parseInt(process.env.OPENALEX_MAX_QUERIES ?? "3", 10);
const openAlexTimeoutMs = Number.parseInt(process.env.OPENALEX_TIMEOUT_MS ?? "30000", 10);
const tavilyApiKey = process.env.TAVILY_API_KEY;
const tavilyMaxResults = Number.parseInt(process.env.TAVILY_MAX_RESULTS ?? "5", 10);
const tavilyTimeoutMs = Number.parseInt(process.env.TAVILY_TIMEOUT_MS ?? "12000", 10);
const tavilyMaxResources = Number.parseInt(process.env.TAVILY_MAX_RESOURCES ?? "20", 10);

const supabaseConfigured =
  hasValue(supabaseUrl) && (hasValue(supabaseServiceRoleKey) || hasValue(supabaseAnonKey));
const databaseConfigured = hasValue(databaseUrl);
const openaiConfigured = hasValue(openaiApiKey);
const tavilyConfigured = hasValue(tavilyApiKey);
const genericResearchConfigured =
  hasValue(process.env.GENERIC_RESEARCH_API_URL) &&
  hasValue(process.env.GENERIC_RESEARCH_API_KEY);

export const config = {
  environment: process.env.NODE_ENV ?? "development",
  frontendUrl: process.env.FRONTEND_URL ?? null,
  openai: {
    enabled: openaiConfigured,
    apiKey: openaiApiKey ?? null,
    researchStepTimeoutMs: Number.isFinite(openaiResearchStepTimeoutMs)
      ? Math.max(1000, Math.min(30_000, openaiResearchStepTimeoutMs))
      : 3000,
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
    enabled: openAlexEnabled || genericResearchConfigured,
    url: process.env.GENERIC_RESEARCH_API_URL ?? null,
    apiKey: process.env.GENERIC_RESEARCH_API_KEY ?? null,
  },
  openAlex: {
    enabled: openAlexEnabled,
    apiKey: process.env.OPENALEX_API_KEY ?? null,
    mailto: process.env.OPENALEX_MAILTO ?? null,
    maxResults: Number.isFinite(openAlexMaxResults)
      ? Math.max(1, Math.min(100, openAlexMaxResults))
      : 24,
    maxQueries: Number.isFinite(openAlexMaxQueries)
      ? Math.max(1, Math.min(5, openAlexMaxQueries))
      : 3,
    timeoutMs: Number.isFinite(openAlexTimeoutMs)
      ? Math.max(1000, Math.min(30_000, openAlexTimeoutMs))
      : 8000,
  },
  tavily: {
    enabled: tavilyConfigured,
    apiKey: tavilyApiKey ?? null,
    maxResults: Number.isFinite(tavilyMaxResults)
      ? Math.max(1, Math.min(10, tavilyMaxResults))
      : 5,
    timeoutMs: Number.isFinite(tavilyTimeoutMs)
      ? Math.max(1000, Math.min(30_000, tavilyTimeoutMs))
      : 12_000,
    maxResources: Number.isFinite(tavilyMaxResources)
      ? Math.max(1, Math.min(50, tavilyMaxResources))
      : 20,
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
      return "OpenAlex or an external research API is not configured. Using demo research sources.";
    case "embeddings":
      return "Embeddings not configured. Using keyword search fallback.";
    case "tavily":
      return "Tavily API key not configured. Showing supplier search links instead of live supplier matches.";
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
