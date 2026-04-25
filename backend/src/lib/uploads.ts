import fs from "node:fs";
import path from "node:path";

import multer from "multer";

import { env } from "../env.js";

const uploadRoot = path.resolve(env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const stamp = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${stamp}-${safe}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
    files: 10,
  },
});
