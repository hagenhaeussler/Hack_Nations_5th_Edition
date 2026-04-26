import { Router, type Request, type Response } from "express";

import { getSetupWarnings } from "../lib/config.js";

const router: Router = Router();

router.get("/:job_id", (req: Request, res: Response) => {
  const jobId = typeof req.params.job_id === "string" ? req.params.job_id : "";
  res.status(404).json({
    ok: false,
    error: `Job "${jobId}" was not found or job persistence is not configured.`,
    warnings: getSetupWarnings(),
  });
});

export default router;
