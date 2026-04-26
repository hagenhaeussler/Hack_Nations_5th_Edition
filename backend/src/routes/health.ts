import { Router, type Request, type Response } from "express";

import { config, getSetupWarnings } from "../lib/config.js";

const router: Router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "labpilot-backend",
    uptime: process.uptime(),
    environment: config.environment,
    openai_enabled: config.openai.enabled,
    database_enabled: config.database.enabled,
    supabase_enabled: config.supabase.enabled,
    storage_enabled: config.storage.enabled,
    research_api_enabled: config.researchApi.enabled,
    warnings: getSetupWarnings(),
  });
});

export default router;
