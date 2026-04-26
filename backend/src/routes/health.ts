import { Router, type Request, type Response } from "express";

import { config, getSetupWarnings } from "../lib/config.js";
import { TECHNICAL_CAPABILITIES } from "../lib/technicalCapabilities.js";

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
    technical_capabilities: {
      pipeline_stage_count: TECHNICAL_CAPABILITIES.pipeline.length,
      retrieval_corpora_count: TECHNICAL_CAPABILITIES.retrieval_corpora.length,
      model_roles: TECHNICAL_CAPABILITIES.model_roles.map((role) => role.role),
      feedback_memory: TECHNICAL_CAPABILITIES.feedback_loop.reusable_memory,
    },
    warnings: getSetupWarnings(),
  });
});

router.get("/capabilities", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    capabilities: TECHNICAL_CAPABILITIES,
    warnings: getSetupWarnings(),
  });
});

export default router;
