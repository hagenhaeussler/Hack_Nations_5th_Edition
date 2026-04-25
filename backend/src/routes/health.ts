import { Router, type Request, type Response } from "express";

const router: Router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "labpilot-backend", uptime: process.uptime() });
});

export default router;
