import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";

import { upload } from "../lib/uploads.js";

const router: Router = Router();

interface UploadedFileSummary {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  storedPath: string;
}

/**
 * POST /api/chat
 *
 * Form-data fields:
 *   - text  : string (required when no files attached)
 *   - files : File[] (optional)
 *
 * For now this is a stub: it accepts the prompt + attachments and acks back
 * with an opaque conversation id so the frontend can wire its UI without
 * blocking on the model integration.
 */
router.post("/", upload.array("files", 10), (req: Request, res: Response) => {
  const text =
    typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  if (!text && files.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Provide a `text` field or at least one file attachment.",
    });
  }

  const attachments: UploadedFileSummary[] = files.map((f) => ({
    id: randomUUID(),
    name: f.originalname,
    size: f.size,
    mimeType: f.mimetype,
    storedPath: f.path,
  }));

  const conversationId = randomUUID();

  res.status(202).json({
    ok: true,
    conversationId,
    receivedAt: new Date().toISOString(),
    message: text,
    attachments: attachments.map(({ id, name, size }) => ({ id, name, size })),
  });
});

export default router;
